// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Minimal view into AgentVault: who owns an agent's bond.
interface IAgentVaultOperator {
    function operatorOf(address agent) external view returns (address);
}

/// @title AgentRevocation — on-chain, operator-controlled revocation for Agent IDs.
/// @notice The off-chain EIP-712 credential is an *identity* statement; this
///         registry is the on-chain kill switch a verifier can read live. An
///         agent is revoked the moment its operator flags it here, and every SDK
///         verifier (not just the API) sees it, because verification re-reads
///         `isRevoked(agent)` on-chain — closing the gap where a revoked but
///         still-signed credential kept verifying via the SDK/MCP.
/// @dev Authority is delegated to the AgentVault: only the wallet that owns an
///      agent's bond (`vault.operatorOf(agent)`) may revoke or un-revoke it.
///      That is the same wallet the API already forces to equal the credential's
///      operator (the anti-hijack rule), so on-chain and off-chain authority
///      agree. Revocation is reversible (an operator can re-instate an agent),
///      but each toggle is a signed, gas-paid transaction from the operator.
contract AgentRevocation {
    /// @notice The AgentVault whose `operatorOf` mapping defines authority.
    IAgentVaultOperator public immutable vault;

    /// @notice Unix timestamp an agent was revoked at (0 = active / not revoked).
    mapping(address agent => uint256 at) public revokedAt;

    event AgentRevoked(address indexed agent, address indexed operator, uint256 at);
    event AgentReinstated(address indexed agent, address indexed operator);

    error NotOperator();
    error UnknownAgent();

    constructor(IAgentVaultOperator vault_) {
        vault = vault_;
    }

    /// @dev Only the agent's bond owner may manage its revocation state.
    function _onlyOperator(address agent) internal view {
        address operator = vault.operatorOf(agent);
        if (operator == address(0)) revert UnknownAgent();
        if (operator != msg.sender) revert NotOperator();
    }

    /// @notice Revoke `agent` (operator only). Idempotent: re-revoking keeps the
    ///         original timestamp so the first revocation time is preserved.
    function revoke(address agent) external {
        _onlyOperator(agent);
        if (revokedAt[agent] == 0) {
            revokedAt[agent] = block.timestamp;
            emit AgentRevoked(agent, msg.sender, block.timestamp);
        }
    }

    /// @notice Re-instate a previously revoked `agent` (operator only).
    function reinstate(address agent) external {
        _onlyOperator(agent);
        if (revokedAt[agent] != 0) {
            revokedAt[agent] = 0;
            emit AgentReinstated(agent, msg.sender);
        }
    }

    /// @notice True if `agent` is currently revoked on-chain.
    function isRevoked(address agent) external view returns (bool) {
        return revokedAt[agent] != 0;
    }
}
