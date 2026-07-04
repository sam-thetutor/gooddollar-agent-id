// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {AgentRevocation, IAgentVaultOperator} from "../src/AgentRevocation.sol";

/// @dev Minimal stubbed vault exposing only `operatorOf`.
contract MockVault is IAgentVaultOperator {
    mapping(address => address) public ops;

    function setOperator(address agent, address op) external {
        ops[agent] = op;
    }

    function operatorOf(address agent) external view returns (address) {
        return ops[agent];
    }
}

contract AgentRevocationTest is Test {
    MockVault vault;
    AgentRevocation rev;

    address operator = address(0xA11CE);
    address attacker = address(0xBAD);
    address agent = address(0xA6E7);

    function setUp() public {
        vault = new MockVault();
        rev = new AgentRevocation(vault);
        vault.setOperator(agent, operator);
    }

    function test_startsActive() public view {
        assertFalse(rev.isRevoked(agent));
    }

    function test_operatorCanRevokeAndReinstate() public {
        vm.prank(operator);
        rev.revoke(agent);
        assertTrue(rev.isRevoked(agent));

        vm.prank(operator);
        rev.reinstate(agent);
        assertFalse(rev.isRevoked(agent));
    }

    function test_nonOperatorCannotRevoke() public {
        vm.prank(attacker);
        vm.expectRevert(AgentRevocation.NotOperator.selector);
        rev.revoke(agent);
    }

    function test_unknownAgentReverts() public {
        vm.prank(operator);
        vm.expectRevert(AgentRevocation.UnknownAgent.selector);
        rev.revoke(address(0xDEAD));
    }

    function test_revokeIsIdempotentAndPreservesTimestamp() public {
        vm.prank(operator);
        rev.revoke(agent);
        uint256 first = rev.revokedAt(agent);

        vm.warp(block.timestamp + 1000);
        vm.prank(operator);
        rev.revoke(agent);
        assertEq(rev.revokedAt(agent), first);
    }
}
