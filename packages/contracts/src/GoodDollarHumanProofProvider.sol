// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IHumanProofProvider} from "./IHumanProofProvider.sol";

/// @notice Minimal read surface of the GoodDollar Identity (IdentityV2) contract.
interface IGoodDollarIdentity {
    /// @return root The human's identity root wallet, or address(0) if the
    ///         account is not a currently-whitelisted (face-verified) human.
    function getWhitelistedRoot(address account) external view returns (address root);
}

/// @title GoodDollarHumanProofProvider
/// @notice A standard ERC-8004 `IHumanProofProvider` backed by GoodDollar's
///         on-chain face-verification whitelist. It lets any
///         `IERC8004ProofOfHuman` registry accept **passport-free,
///         GoodDollar-rooted** humans as a proof-of-human source — the missing
///         provider for the document-less.
/// @dev Trustless and non-custodial:
///      - Humanity is read **live** from the GoodDollar Identity contract
///        (`getWhitelistedRoot`), so a proof is only valid while the human is
///        currently verified.
///      - Consent is enforced via an EIP-712 signature from the human wallet,
///        so nobody can register an agent under another human's nullifier.
///      - The nullifier is the human's identity **root**, so every agent a human
///        backs maps to the same nullifier — exactly the sybil-scoping the
///        extension expects (the registry enforces per-human limits).
contract GoodDollarHumanProofProvider is IHumanProofProvider {
    /// @notice GoodDollar Identity (IdentityV2) contract on Celo.
    IGoodDollarIdentity public immutable identity;

    string public constant PROVIDER_NAME = "GoodDollar";

    /// @notice Strength score (0-100). GoodDollar = sybil-resistant face/liveness
    ///         verification of a unique human, without a government document
    ///         (Self's passport NFC tier is 100). Verifiers weigh this as they see fit.
    uint8 public constant VERIFICATION_STRENGTH = 75;

    bytes32 private constant _DOMAIN_TYPEHASH = keccak256(
        "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"
    );
    bytes32 private constant _PROOF_TYPEHASH =
        keccak256("GoodDollarHumanProof(address human,address agent)");

    bytes32 public immutable domainSeparator;

    constructor(IGoodDollarIdentity identity_) {
        identity = identity_;
        domainSeparator = keccak256(
            abi.encode(
                _DOMAIN_TYPEHASH,
                keccak256(bytes("GoodDollar Agent ID")),
                keccak256(bytes("1")),
                block.chainid,
                address(this)
            )
        );
    }

    /// @inheritdoc IHumanProofProvider
    /// @dev `data  = abi.encode(address human, address agent)`.
    ///      `proof = ` the 65-byte EIP-712 signature by `human` over
    ///      `GoodDollarHumanProof(human, agent)`. Returns `(false, 0)` for an
    ///      unverified human or an invalid/non-consenting signature rather than
    ///      reverting, so a calling registry gets a clean boolean.
    function verifyHumanProof(bytes calldata proof, bytes calldata data)
        external
        view
        returns (bool verified, uint256 nullifier)
    {
        (address human, address agent) = abi.decode(data, (address, address));

        // 1. Live humanity check — only currently face-verified humans pass.
        address root = identity.getWhitelistedRoot(human);
        if (root == address(0)) return (false, 0);

        // 2. Consent check — the human must have signed for this agent.
        bytes32 structHash = keccak256(abi.encode(_PROOF_TYPEHASH, human, agent));
        bytes32 digest =
            keccak256(abi.encodePacked("\x19\x01", domainSeparator, structHash));
        if (_recover(digest, proof) != human) return (false, 0);

        // 3. Deterministic per-human nullifier = the identity root.
        return (true, uint256(uint160(root)));
    }

    /// @inheritdoc IHumanProofProvider
    function providerName() external pure returns (string memory) {
        return PROVIDER_NAME;
    }

    /// @inheritdoc IHumanProofProvider
    function verificationStrength() external pure returns (uint8) {
        return VERIFICATION_STRENGTH;
    }

    /// @notice EIP-712 digest a `human` must sign to authorize `agent`.
    function proofDigest(address human, address agent)
        external
        view
        returns (bytes32)
    {
        bytes32 structHash = keccak256(abi.encode(_PROOF_TYPEHASH, human, agent));
        return keccak256(abi.encodePacked("\x19\x01", domainSeparator, structHash));
    }

    function _recover(bytes32 digest, bytes calldata sig)
        internal
        pure
        returns (address)
    {
        if (sig.length != 65) return address(0);
        bytes32 r;
        bytes32 s;
        uint8 v;
        assembly {
            r := calldataload(sig.offset)
            s := calldataload(add(sig.offset, 0x20))
            v := byte(0, calldataload(add(sig.offset, 0x40)))
        }
        if (v < 27) v += 27;
        if (v != 27 && v != 28) return address(0);
        // Reject high-s malleable signatures.
        if (
            uint256(s) >
            0x7FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF5D576E7357A4501DDFE92F46681B20A0
        ) {
            return address(0);
        }
        return ecrecover(digest, v, r, s);
    }
}
