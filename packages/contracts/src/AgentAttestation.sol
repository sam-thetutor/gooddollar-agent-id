// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title AgentAttestation — on-chain proof that an agent address controls its key.
/// @notice A registration in the Agent ID network names an agent *address*; by
///         itself that never proves the address's key exists or consented. This
///         registry stores that fact on-chain so anyone can verify it without
///         trusting the issuing API: an agent either calls {attest} itself
///         (msg.sender IS the proof of possession) or signs an EIP-712
///         `AttestAgent` message that anyone may relay via {attestFor}
///         (gasless for the agent; single-use via nonce + deadline).
/// @dev Deliberately stores only `provenAt` (a timestamp), never the signature:
///      a stored signature could be mistaken for a reusable authentication
///      token. This attestation is a *historical* fact ("the key existed and
///      consented at time T") — live counterparty authentication still requires
///      a fresh agent-signed challenge (see the SDK's AgentAuth).
contract AgentAttestation {
    /// @notice Unix time the agent first proved key possession (0 = never).
    mapping(address agent => uint256 at) public provenAt;

    /// @notice Per-agent nonce consumed by {attestFor} signatures.
    mapping(address agent => uint256 nonce) public nonces;

    event AgentAttested(address indexed agent, uint256 at, address relayer);

    error Expired();
    error BadSignature();

    bytes32 private constant ATTEST_TYPEHASH =
        keccak256("AttestAgent(address agent,uint256 nonce,uint256 deadline)");

    bytes32 public immutable DOMAIN_SEPARATOR;

    constructor() {
        DOMAIN_SEPARATOR = keccak256(
            abi.encode(
                keccak256(
                    "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"
                ),
                keccak256(bytes("GoodDollar Agent Attestation")),
                keccak256(bytes("1")),
                block.chainid,
                address(this)
            )
        );
    }

    /// @notice Attest directly from the agent's own account. Sending this
    ///         transaction is itself the proof of key possession.
    function attest() external {
        _attest(msg.sender);
    }

    /// @notice Relay an agent-signed attestation (the relayer pays gas, only
    ///         the agent's signature counts). Single-use: the signature commits
    ///         to the agent's current nonce and a deadline.
    function attestFor(
        address agent,
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
                    abi.encode(ATTEST_TYPEHASH, agent, nonces[agent]++, deadline)
                )
            )
        );

        bytes32 r = bytes32(signature[0:32]);
        bytes32 s = bytes32(signature[32:64]);
        uint8 v = uint8(signature[64]);
        address recovered = ecrecover(digest, v, r, s);
        if (recovered == address(0) || recovered != agent) revert BadSignature();

        _attest(agent);
    }

    /// @notice True if the agent has ever proven key possession.
    function isProven(address agent) external view returns (bool) {
        return provenAt[agent] != 0;
    }

    /// @dev First attestation timestamp is preserved; re-attesting only emits.
    function _attest(address agent) internal {
        if (provenAt[agent] == 0) {
            provenAt[agent] = block.timestamp;
        }
        emit AgentAttested(agent, block.timestamp, msg.sender);
    }
}
