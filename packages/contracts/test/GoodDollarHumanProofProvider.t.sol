// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {
    GoodDollarHumanProofProvider,
    IGoodDollarIdentity
} from "../src/GoodDollarHumanProofProvider.sol";
import {IHumanProofProvider} from "../src/IHumanProofProvider.sol";

/// Mock of GoodDollar IdentityV2: a wallet maps to its whitelisted root.
contract MockIdentity is IGoodDollarIdentity {
    mapping(address => address) internal roots;

    function setRoot(address account, address root) external {
        roots[account] = root;
    }

    function getWhitelistedRoot(address account) external view returns (address) {
        return roots[account];
    }
}

/// Tiny stand-in for an `IERC8004ProofOfHuman` registry: it calls the provider
/// exactly like `registerWithHumanProof` would and records the nullifier, so we
/// can prove the full provider <-> registry handshake end to end.
contract RegistryHarness {
    IHumanProofProvider public immutable provider;
    mapping(uint256 => uint256) public agentNullifier; // agentId => nullifier
    mapping(uint256 => uint256) public agentCountForHuman; // nullifier => count
    uint256 public nextId;

    error ProofRejected();

    constructor(IHumanProofProvider provider_) {
        provider = provider_;
    }

    function registerWithHumanProof(bytes calldata proof, bytes calldata data)
        external
        returns (uint256 agentId, uint256 nullifier)
    {
        bool verified;
        (verified, nullifier) = provider.verifyHumanProof(proof, data);
        if (!verified) revert ProofRejected();
        agentId = ++nextId;
        agentNullifier[agentId] = nullifier;
        agentCountForHuman[nullifier] += 1;
    }
}

contract GoodDollarHumanProofProviderTest is Test {
    MockIdentity internal identity;
    GoodDollarHumanProofProvider internal provider;
    RegistryHarness internal registry;

    uint256 internal humanPk = 0xA11CE;
    address internal human;
    address internal root = address(0x1234567890123456789012345678901234567890);
    address internal agent = address(0xA6E11);

    function setUp() public {
        human = vm.addr(humanPk);
        identity = new MockIdentity();
        provider = new GoodDollarHumanProofProvider(IGoodDollarIdentity(address(identity)));
        registry = new RegistryHarness(provider);
    }

    function _sign(uint256 pk, address h, address a) internal view returns (bytes memory) {
        bytes32 digest = provider.proofDigest(h, a);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, digest);
        return abi.encodePacked(r, s, v);
    }

    function test_Metadata() public view {
        assertEq(provider.providerName(), "GoodDollar");
        assertEq(provider.verificationStrength(), 75);
    }

    function test_VerifiedHumanWithConsentPasses() public {
        identity.setRoot(human, root);
        bytes memory data = abi.encode(human, agent);
        bytes memory proof = _sign(humanPk, human, agent);

        (bool verified, uint256 nullifier) = provider.verifyHumanProof(proof, data);
        assertTrue(verified);
        assertEq(nullifier, uint256(uint160(root)));
    }

    function test_NonWhitelistedFails() public view {
        // No root set for `human`.
        bytes memory data = abi.encode(human, agent);
        bytes memory proof = _sign(humanPk, human, agent);

        (bool verified, uint256 nullifier) = provider.verifyHumanProof(proof, data);
        assertFalse(verified);
        assertEq(nullifier, 0);
    }

    function test_WrongSignerFails() public {
        identity.setRoot(human, root);
        bytes memory data = abi.encode(human, agent);
        // Signed by a different key than `human`.
        bytes memory proof = _sign(0xBEEF, human, agent);

        (bool verified,) = provider.verifyHumanProof(proof, data);
        assertFalse(verified);
    }

    function test_SignatureBoundToAgent() public {
        identity.setRoot(human, root);
        // Consent signed for a different agent must not authorize `agent`.
        bytes memory proof = _sign(humanPk, human, address(0xDEAD));
        bytes memory data = abi.encode(human, agent);

        (bool verified,) = provider.verifyHumanProof(proof, data);
        assertFalse(verified);
    }

    function test_MalformedSignatureFails() public {
        identity.setRoot(human, root);
        bytes memory data = abi.encode(human, agent);
        bytes memory proof = hex"1234"; // not 65 bytes

        (bool verified,) = provider.verifyHumanProof(proof, data);
        assertFalse(verified);
    }

    function test_SameHumanSameNullifierAcrossAgents() public {
        identity.setRoot(human, root);
        address agentB = address(0xB0B);

        (, uint256 n1) =
            provider.verifyHumanProof(_sign(humanPk, human, agent), abi.encode(human, agent));
        (, uint256 n2) =
            provider.verifyHumanProof(_sign(humanPk, human, agentB), abi.encode(human, agentB));
        assertEq(n1, n2);
    }

    // --- end-to-end through a mock registry --------------------------------

    function test_RegistryRegistersAndCountsPerHuman() public {
        identity.setRoot(human, root);
        address agentB = address(0xB0B);

        (uint256 id1, uint256 nf1) = registry.registerWithHumanProof(
            _sign(humanPk, human, agent), abi.encode(human, agent)
        );
        (uint256 id2, uint256 nf2) = registry.registerWithHumanProof(
            _sign(humanPk, human, agentB), abi.encode(human, agentB)
        );

        assertEq(id1, 1);
        assertEq(id2, 2);
        assertEq(nf1, nf2);
        assertEq(registry.agentCountForHuman(nf1), 2);
    }

    function test_RegistryRejectsUnverified() public {
        // human not whitelisted. Precompute args so expectRevert targets the
        // registry call, not the proofDigest read inside _sign.
        bytes memory proof = _sign(humanPk, human, agent);
        bytes memory data = abi.encode(human, agent);
        vm.expectRevert(RegistryHarness.ProofRejected.selector);
        registry.registerWithHumanProof(proof, data);
    }

    function test_RevokedHumanStopsVerifying() public {
        identity.setRoot(human, root);
        bytes memory data = abi.encode(human, agent);
        bytes memory proof = _sign(humanPk, human, agent);

        (bool ok,) = provider.verifyHumanProof(proof, data);
        assertTrue(ok);

        // Human's verification lapses (root cleared) -> proof no longer valid.
        identity.setRoot(human, address(0));
        (bool ok2,) = provider.verifyHumanProof(proof, data);
        assertFalse(ok2);
    }
}
