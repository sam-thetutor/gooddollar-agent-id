// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {AgentVault} from "../src/AgentVault.sol";
import {IERC20} from "../src/IERC20.sol";

/// Minimal mintable ERC-20 for tests.
contract MockERC20 is IERC20 {
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        return true;
    }

    function transferFrom(address from, address to, uint256 amount)
        external
        returns (bool)
    {
        allowance[from][msg.sender] -= amount;
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        return true;
    }
}

contract AgentVaultTest is Test {
    MockERC20 internal token;
    AgentVault internal vault;

    // Test-time minimum bond required to register an agent.
    uint256 internal constant MIN_STAKE = 50 ether;

    address internal operator = address(0xA11CE);
    address internal other = address(0xB0B);
    address internal agent = address(0xA6E11);

    function setUp() public {
        token = new MockERC20();
        vault = new AgentVault(IERC20(address(token)), MIN_STAKE);
        token.mint(operator, 1_000_000 ether);
        vm.prank(operator);
        token.approve(address(vault), type(uint256).max);
    }

    // --- stake --------------------------------------------------------------

    function test_MinStakeExposed() public view {
        assertEq(vault.minStake(), MIN_STAKE);
    }

    function test_StakeRecordsOperatorAndAmount() public {
        vm.prank(operator);
        vault.stake(agent, 100 ether);
        assertEq(vault.operatorOf(agent), operator);
        assertEq(vault.stakeOf(agent), 100 ether);
        assertEq(token.balanceOf(address(vault)), 100 ether);
    }

    function test_StakeZeroReverts() public {
        vm.prank(operator);
        vm.expectRevert(AgentVault.AmountZero.selector);
        vault.stake(agent, 0);
    }

    function test_StakeBelowMinReverts() public {
        vm.prank(operator);
        vm.expectRevert(AgentVault.BelowMinStake.selector);
        vault.stake(agent, MIN_STAKE - 1);
    }

    function test_StakeExactlyMinSucceeds() public {
        vm.prank(operator);
        vault.stake(agent, MIN_STAKE);
        assertEq(vault.stakeOf(agent), MIN_STAKE);
    }

    function test_StakeAccumulatesOnceAboveMin() public {
        vm.startPrank(operator);
        vault.stake(agent, 60 ether); // first must meet the minimum
        vault.stake(agent, 40 ether); // top-ups of any size are fine
        vm.stopPrank();
        assertEq(vault.stakeOf(agent), 100 ether);
    }

    function test_OnlyFirstOperatorCanManage() public {
        vm.prank(operator);
        vault.stake(agent, 50 ether);

        token.mint(other, 50 ether);
        vm.prank(other);
        token.approve(address(vault), type(uint256).max);

        vm.prank(other);
        vm.expectRevert(AgentVault.WrongOperator.selector);
        vault.stake(agent, 50 ether);
    }

    function test_NonOperatorCannotRequestUnstake() public {
        vm.prank(operator);
        vault.stake(agent, 50 ether);
        vm.prank(other);
        vm.expectRevert(AgentVault.NotOperator.selector);
        vault.requestUnstake(agent);
    }

    function test_UnstakeRequiresCooldown() public {
        vm.startPrank(operator);
        vault.stake(agent, 100 ether);

        // No request yet.
        vm.expectRevert(AgentVault.CooldownNotStarted.selector);
        vault.withdrawStake(agent, 50 ether);

        // Request, but cooldown still active.
        vault.requestUnstake(agent);
        vm.expectRevert(AgentVault.CooldownActive.selector);
        vault.withdrawStake(agent, 50 ether);

        // After cooldown, partial withdraw leaving >= min works.
        vm.warp(block.timestamp + vault.UNSTAKE_COOLDOWN());
        vault.withdrawStake(agent, 50 ether);
        assertEq(vault.stakeOf(agent), 50 ether);
        assertEq(token.balanceOf(operator), 1_000_000 ether - 50 ether);
        vm.stopPrank();
    }

    function test_WithdrawLeavingDustReverts() public {
        vm.startPrank(operator);
        vault.stake(agent, 100 ether);
        vault.requestUnstake(agent);
        vm.warp(block.timestamp + vault.UNSTAKE_COOLDOWN());
        // Leaving 100 - 60 = 40 (< MIN_STAKE) is not allowed.
        vm.expectRevert(AgentVault.BelowMinStake.selector);
        vault.withdrawStake(agent, 60 ether);
        vm.stopPrank();
    }

    function test_FullExitAllowed() public {
        vm.startPrank(operator);
        vault.stake(agent, 100 ether);
        vault.requestUnstake(agent);
        vm.warp(block.timestamp + vault.UNSTAKE_COOLDOWN());
        vault.withdrawStake(agent, 100 ether); // remaining 0 is allowed
        assertEq(vault.stakeOf(agent), 0);
        vm.stopPrank();
    }

    function test_WithdrawMoreThanStakedReverts() public {
        vm.startPrank(operator);
        vault.stake(agent, 60 ether);
        vault.requestUnstake(agent);
        vm.warp(block.timestamp + vault.UNSTAKE_COOLDOWN());
        vm.expectRevert(AgentVault.InsufficientStake.selector);
        vault.withdrawStake(agent, 61 ether);
        vm.stopPrank();
    }

    function test_WithdrawNeedsFreshRequestEachTime() public {
        vm.startPrank(operator);
        vault.stake(agent, 100 ether);
        vault.requestUnstake(agent);
        vm.warp(block.timestamp + vault.UNSTAKE_COOLDOWN());
        vault.withdrawStake(agent, 40 ether); // remaining 60 >= min
        // unlockAt reset → second withdraw needs a new request.
        vm.expectRevert(AgentVault.CooldownNotStarted.selector);
        vault.withdrawStake(agent, 10 ether);
        vm.stopPrank();
    }

    function test_GetAgentSnapshot() public {
        vm.prank(operator);
        vault.stake(agent, 100 ether);

        (address op, uint256 stakeAmount, uint256 unlockAt) =
            vault.getAgent(agent);
        assertEq(op, operator);
        assertEq(stakeAmount, 100 ether);
        assertEq(unlockAt, 0);
    }
}
