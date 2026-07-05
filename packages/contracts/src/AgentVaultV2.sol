// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "./IERC20.sol";

/// @title AgentVaultV2 — accountability bond with agent-consented operators.
/// @notice Same refundable per-agent G$ bond as V1, plus the fix for the
///         operator-squatting attack: in V1 the FIRST wallet to stake for any
///         agent address became its permanent operator, so an attacker could
///         bond a minimum stake for a victim's agent and lock the legitimate
///         operator out of registration forever. In V2 an operator slot can
///         only be claimed with the agent's consent:
///
///           1. The agent names its operator — either by calling
///              {approveOperator} from its own account, or by signing an
///              EIP-712 `ApproveOperator` message that anyone can relay via
///              {approveOperatorFor} (gasless for the agent, single-use).
///           2. Only that approved wallet can make the first {stake} and
///              become `operatorOf[agent]`.
///           3. When the bond is fully withdrawn the operator binding clears,
///              so the agent can consent to a different operator later —
///              nothing about an agent address is squattable or permanent.
/// @dev Non-custodial exactly like V1: funds only ever move between the
///      operator and this vault. AgentRevocation reads `operatorOf`, so a V2
///      deployment pairs with a new AgentRevocation pointed at it.
contract AgentVaultV2 {
    IERC20 public immutable token;

    /// @notice Minimum bond (base units) for an agent to count as staked.
    uint256 public immutable minStake;

    /// @notice Cooldown between requesting an unstake and withdrawing.
    uint256 public constant UNSTAKE_COOLDOWN = 3 days;

    /// @notice The operator (human) currently bonded behind an agent.
    mapping(address agent => address operator) public operatorOf;
    /// @notice The operator the agent has consented to (claimable via stake).
    mapping(address agent => address operator) public approvedOperatorOf;
    /// @notice G$ bonded behind an agent.
    mapping(address agent => uint256 amount) public stakeOf;
    /// @notice Timestamp after which a requested unstake may be withdrawn (0 = none).
    mapping(address agent => uint256 unlockAt) public unstakeUnlockAt;
    /// @notice Per-agent nonce consumed by {approveOperatorFor} signatures.
    mapping(address agent => uint256 nonce) public nonces;

    event OperatorApproved(address indexed agent, address indexed operator);
    event Staked(address indexed agent, address indexed operator, uint256 amount);
    event UnstakeRequested(address indexed agent, uint256 unlockAt);
    event StakeWithdrawn(address indexed agent, uint256 amount);
    event OperatorCleared(address indexed agent, address indexed operator);

    error NotOperator();
    error WrongOperator();
    error OperatorNotApproved();
    error AmountZero();
    error ZeroAddress();
    error InsufficientStake();
    error BelowMinStake();
    error CooldownNotStarted();
    error CooldownActive();
    error TransferFailed();
    error Expired();
    error BadSignature();

    bytes32 private constant APPROVE_TYPEHASH = keccak256(
        "ApproveOperator(address agent,address operator,uint256 nonce,uint256 deadline)"
    );

    bytes32 public immutable DOMAIN_SEPARATOR;

    // Minimal reentrancy guard.
    uint256 private _locked = 1;

    modifier nonReentrant() {
        require(_locked == 1, "REENTRANCY");
        _locked = 2;
        _;
        _locked = 1;
    }

    constructor(IERC20 token_, uint256 minStake_) {
        token = token_;
        minStake = minStake_;
        DOMAIN_SEPARATOR = keccak256(
            abi.encode(
                keccak256(
                    "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"
                ),
                keccak256(bytes("GoodDollar Agent Vault")),
                keccak256(bytes("2")),
                block.chainid,
                address(this)
            )
        );
    }

    // --- agent consent --------------------------------------------------------

    /// @notice The agent (msg.sender) consents to `operator` bonding for it.
    ///         Sending the transaction is itself the proof of key possession.
    function approveOperator(address operator) external {
        _approve(msg.sender, operator);
    }

    /// @notice Relay an agent-signed operator approval (relayer pays gas; only
    ///         the agent's signature counts). Single-use via nonce + deadline.
    function approveOperatorFor(
        address agent,
        address operator,
        uint256 deadline,
        bytes calldata signature
    ) external {
        if (block.timestamp > deadline) revert Expired();
        if (signature.length != 65) revert BadSignature();

        bytes32 digest = keccak256(
            abi.encodePacked(
                "\x19\x01",
                DOMAIN_SEPARATOR,
                keccak256(
                    abi.encode(
                        APPROVE_TYPEHASH, agent, operator, nonces[agent]++, deadline
                    )
                )
            )
        );

        bytes32 r = bytes32(signature[0:32]);
        bytes32 s = bytes32(signature[32:64]);
        uint8 v = uint8(signature[64]);
        // Reject high-s (malleable) signatures: EIP-2 upper bound on s.
        if (
            uint256(s)
                > 0x7FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF5D576E7357A4501DDFE92F46681B20A0
        ) revert BadSignature();
        address recovered = ecrecover(digest, v, r, s);
        if (recovered == address(0) || recovered != agent) revert BadSignature();

        _approve(agent, operator);
    }

    function _approve(address agent, address operator) internal {
        if (operator == address(0)) revert ZeroAddress();
        approvedOperatorOf[agent] = operator;
        emit OperatorApproved(agent, operator);
    }

    // --- internal helpers -----------------------------------------------------

    /// @dev Binds the agent to msg.sender on first stake — but ONLY if the
    ///      agent consented — and enforces the binding afterwards.
    function _ensureOperator(address agent) internal {
        address current = operatorOf[agent];
        if (current == address(0)) {
            if (approvedOperatorOf[agent] != msg.sender) {
                revert OperatorNotApproved();
            }
            operatorOf[agent] = msg.sender;
        } else if (current != msg.sender) {
            revert WrongOperator();
        }
    }

    function _onlyOperator(address agent) internal view {
        if (operatorOf[agent] != msg.sender) revert NotOperator();
    }

    function _pull(address from, uint256 amount) internal {
        if (!token.transferFrom(from, address(this), amount)) {
            revert TransferFailed();
        }
    }

    function _push(address to, uint256 amount) internal {
        if (!token.transfer(to, amount)) revert TransferFailed();
    }

    // --- stake (bond) -----------------------------------------------------------

    /// @notice Operator bonds `amount` G$ behind `agent`. Requires prior approve
    ///         (ERC-20) AND the agent's operator consent (see {approveOperator}).
    /// @dev The resulting position must be at least `minStake`, so the first
    ///      stake for an agent must meet the minimum in one call.
    function stake(address agent, uint256 amount) external nonReentrant {
        if (amount == 0) revert AmountZero();
        _ensureOperator(agent);
        uint256 newAmount = stakeOf[agent] + amount;
        if (newAmount < minStake) revert BelowMinStake();
        stakeOf[agent] = newAmount;
        _pull(msg.sender, amount);
        emit Staked(agent, msg.sender, amount);
    }

    /// @notice Start the unstake cooldown for `agent` (operator only).
    function requestUnstake(address agent) external {
        _onlyOperator(agent);
        uint256 unlockAt = block.timestamp + UNSTAKE_COOLDOWN;
        unstakeUnlockAt[agent] = unlockAt;
        emit UnstakeRequested(agent, unlockAt);
    }

    /// @notice Withdraw bonded stake after the cooldown (operator only). A full
    ///         exit clears the operator binding so the agent may consent to a
    ///         new operator afterwards.
    function withdrawStake(address agent, uint256 amount) external nonReentrant {
        _onlyOperator(agent);
        if (amount == 0) revert AmountZero();
        uint256 unlockAt = unstakeUnlockAt[agent];
        if (unlockAt == 0) revert CooldownNotStarted();
        if (block.timestamp < unlockAt) revert CooldownActive();
        if (amount > stakeOf[agent]) revert InsufficientStake();
        uint256 remaining = stakeOf[agent] - amount;
        // No sub-minimum dust: either keep a full bond or exit completely.
        if (remaining != 0 && remaining < minStake) revert BelowMinStake();
        stakeOf[agent] = remaining;
        unstakeUnlockAt[agent] = 0; // require a fresh request for the next withdraw
        if (remaining == 0) {
            emit OperatorCleared(agent, operatorOf[agent]);
            delete operatorOf[agent];
            delete approvedOperatorOf[agent]; // consent is per-engagement
        }
        _push(msg.sender, amount);
        emit StakeWithdrawn(agent, amount);
    }

    // --- views -------------------------------------------------------------------

    /// @notice Full accounting snapshot for `agent`.
    function getAgent(address agent)
        external
        view
        returns (address operator, uint256 stakeAmount, uint256 unlockAt)
    {
        operator = operatorOf[agent];
        stakeAmount = stakeOf[agent];
        unlockAt = unstakeUnlockAt[agent];
    }
}
