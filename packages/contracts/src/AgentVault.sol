// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "./IERC20.sol";

/// @title AgentVault — on-chain accountability bond for GoodDollar Agent IDs.
/// @notice Per-agent G$ **stake**: a refundable bond an operator (the human)
///         locks behind an agent to vouch for it with skin in the game. A bond
///         of at least `minStake` is **required** to register an agent in the
///         GoodDollar Agent ID network — this gives G$ a non-optional role while
///         keeping the deposit fully refundable (it only ever returns to the
///         operator). The token is G$ on Celo, but any ERC-20 works.
/// @dev Non-custodial: only the operator that first stakes an agent can manage
///      its bond, and funds only ever move between that operator and this vault
///      (in via `stake`, out via `withdrawStake` after a cooldown). The contract
///      never sends funds to any third party. Off-chain EIP-712 credentials
///      (packages/agent-id) are the source of truth for *identity*; this contract
///      enforces the *economic* requirement: an active bond >= `minStake`.
contract AgentVault {
    IERC20 public immutable token;

    /// @notice Minimum bond required for an agent to be considered staked
    ///         (base units; e.g. 250e18 for 250 G$). A position must be either
    ///         zero or at least this amount — no sub-minimum dust bonds.
    uint256 public immutable minStake;

    /// @notice Cooldown between requesting an unstake and being able to withdraw.
    uint256 public constant UNSTAKE_COOLDOWN = 3 days;

    /// @notice The operator (human) that controls a given agent's bond.
    mapping(address agent => address operator) public operatorOf;
    /// @notice G$ bonded behind an agent.
    mapping(address agent => uint256 amount) public stakeOf;
    /// @notice Timestamp after which a requested unstake may be withdrawn (0 = none).
    mapping(address agent => uint256 unlockAt) public unstakeUnlockAt;

    event Staked(address indexed agent, address indexed operator, uint256 amount);
    event UnstakeRequested(address indexed agent, uint256 unlockAt);
    event StakeWithdrawn(address indexed agent, uint256 amount);

    error NotOperator();
    error WrongOperator();
    error AmountZero();
    error InsufficientStake();
    error BelowMinStake();
    error CooldownNotStarted();
    error CooldownActive();
    error TransferFailed();

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
    }

    // --- internal helpers ---------------------------------------------------

    /// @dev Claims `agent` for msg.sender on first use; afterwards enforces it.
    function _ensureOperator(address agent) internal {
        address current = operatorOf[agent];
        if (current == address(0)) {
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

    // --- stake (bond) -------------------------------------------------------

    /// @notice Operator bonds `amount` G$ behind `agent`. Requires prior approve.
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

    /// @notice Withdraw bonded stake after the cooldown (operator only).
    function withdrawStake(address agent, uint256 amount)
        external
        nonReentrant
    {
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
        _push(msg.sender, amount);
        emit StakeWithdrawn(agent, amount);
    }

    // --- views --------------------------------------------------------------

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
