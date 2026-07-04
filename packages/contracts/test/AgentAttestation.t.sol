// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {AgentAttestation} from "../src/AgentAttestation.sol";

contract AgentAttestationTest is Test {
    AgentAttestation att;

    uint256 agentPk = 0xA11CE;
    address agent;
    address relayer = address(0xBEEF);

    function setUp() public {
        att = new AgentAttestation();
        agent = vm.addr(agentPk);
    }

    function _sign(
        uint256 pk,
        address agent_,
        uint256 nonce,
        uint256 deadline
    ) internal view returns (bytes memory) {
        bytes32 digest = keccak256(
            abi.encodePacked(
                "\x19\x01",
                att.DOMAIN_SEPARATOR(),
                keccak256(
                    abi.encode(
                        keccak256(
                            "AttestAgent(address agent,uint256 nonce,uint256 deadline)"
                        ),
                        agent_,
                        nonce,
                        deadline
                    )
                )
            )
        );
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, digest);
        return abi.encodePacked(r, s, v);
    }

    function test_startsUnproven() public view {
        assertFalse(att.isProven(agent));
        assertEq(att.provenAt(agent), 0);
    }

    function test_directAttest() public {
        vm.prank(agent);
        att.attest();
        assertTrue(att.isProven(agent));
        assertEq(att.provenAt(agent), block.timestamp);
    }

    function test_firstTimestampPreservedOnReattest() public {
        vm.prank(agent);
        att.attest();
        uint256 first = att.provenAt(agent);

        vm.warp(block.timestamp + 1000);
        vm.prank(agent);
        att.attest();
        assertEq(att.provenAt(agent), first);
    }

    function test_relayedAttest() public {
        bytes memory sig = _sign(agentPk, agent, 0, block.timestamp + 600);
        vm.prank(relayer);
        att.attestFor(agent, block.timestamp + 600, sig);
        assertTrue(att.isProven(agent));
        assertEq(att.nonces(agent), 1);
    }

    function test_relayedSigIsSingleUse() public {
        uint256 deadline = block.timestamp + 600;
        bytes memory sig = _sign(agentPk, agent, 0, deadline);
        att.attestFor(agent, deadline, sig);

        // Same signature again: nonce advanced, so it no longer recovers.
        vm.expectRevert(AgentAttestation.BadSignature.selector);
        att.attestFor(agent, deadline, sig);
    }

    function test_expiredDeadlineReverts() public {
        uint256 deadline = block.timestamp + 600;
        bytes memory sig = _sign(agentPk, agent, 0, deadline);
        vm.warp(deadline + 1);
        vm.expectRevert(AgentAttestation.Expired.selector);
        att.attestFor(agent, deadline, sig);
    }

    function test_wrongSignerReverts() public {
        // Signed by a different key claiming to be `agent`.
        bytes memory sig = _sign(0xB0B, agent, 0, block.timestamp + 600);
        vm.expectRevert(AgentAttestation.BadSignature.selector);
        att.attestFor(agent, block.timestamp + 600, sig);
    }

    function test_attestationDoesNotTransferBetweenAddresses() public {
        // Signature for the signer's own address cannot prove a different one.
        bytes memory sig = _sign(agentPk, agent, 0, block.timestamp + 600);
        vm.expectRevert(AgentAttestation.BadSignature.selector);
        att.attestFor(address(0xDEAD), block.timestamp + 600, sig);
    }
}
