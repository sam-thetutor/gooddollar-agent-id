// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IHumanProofProvider
/// @notice Pluggable identity backend for the ERC-8004 Proof-of-Human extension
///         (`IERC8004ProofOfHuman`). A registry calls `verifyHumanProof` during
///         `registerWithHumanProof` to confirm a real, unique human is behind an
///         agent and to obtain a deterministic per-human nullifier.
/// @dev This is the exact provider interface used by the proposed ERC-8004
///      Proof-of-Human extension and Self Agent ID's `SelfHumanProofProvider`.
///      It is intentionally provider-agnostic: any identity system (Self / ZK
///      passport, World ID, Humanity Protocol, GoodDollar, …) can implement it.
interface IHumanProofProvider {
    /// @notice Verify a proof of humanity and return its deterministic nullifier.
    /// @param proof Provider-specific proof bytes (for GoodDollar: the human's
    ///        EIP-712 consent signature).
    /// @param data  Provider-specific context bytes (for GoodDollar: the human
    ///        wallet and the agent address).
    /// @return verified True if a real human is proven.
    /// @return nullifier Deterministic id for that human: the same human (same
    ///         scope) always yields the same nullifier, enabling sybil limits
    ///         without revealing identity.
    function verifyHumanProof(bytes calldata proof, bytes calldata data)
        external
        returns (bool verified, uint256 nullifier);

    /// @notice Human-readable provider name (e.g. "GoodDollar", "Self Protocol").
    function providerName() external view returns (string memory);

    /// @notice Verification strength score (0-100) the registry/verifiers can weigh.
    function verificationStrength() external view returns (uint8);
}
