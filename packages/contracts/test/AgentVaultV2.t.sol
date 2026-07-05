// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {AgentVaultV2} from "../src/AgentVaultV2.sol";
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

contract AgentVaultV2Test is Test {
    MockERC20 internal token;
    AgentVaultV2 internal vault;

    uint256 internal constant MIN_STAKE = 50 ether;

    address internal operator = address(0xA11CE);
    address internal attacker = address(0xBAD);

    // The agent needs a real private key so it can sign approvals.
    uint256 internal agentKey = 0xA6E11;
    address internal agent;

    function setUp() public {
        agent = vm.addr(agentKey);
        token = new MockERC20();
        vault = new AgentVaultV2(IERC20(address(token)), MIN_STAKE);

        token.mint(operator, 1_000_000 ether);
        vm.prank(operator);
        token.approve(address(vault), type(uint256).max);

        token.mint(attacker, 1_000_000 ether);
        vm.prank(attacker);
        token.approve(address(vault), type(uint256).max);
    }

    function _approveViaAgent(address op) internal {
        vm.prank(agent);
        vault.approveOperator(op);
    }

    function _signApproval(address op, uint256 nonce, uint256 deadline)
        internal
        view
        returns (bytes memory)
    {
        bytes32 digest = keccak256(
            abi.encodePacked(
                "\x19\x01",
                vault.DOMAIN_SEPARATOR(),
                keccak256(
                    abi.encode(
                        keccak256(
                            "ApproveOperator(address agent,address operator,uint256 nonce,uint256 deadline)"
                        ),
                        agent,
                        op,
                        nonce,
                        deadline
                    )
                )
            )
        );
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(agentKey, digest);
        return abi.encodePacked(r, s, v);
    }

    // --- the squatting attack this contract exists to prevent ----------------

    function test_SquatterCannotClaimUnapprovedAgent() public {
        // V1 bug: first staker became the permanent operator. Here the agent
        // never consented to the attacker, so the claim reverts.
        vm.prank(attacker);
        vm.expectRevert(AgentVaultV2.OperatorNotApproved.selector);
        vault.stake(agent, MIN_STAKE);
    }

    function test_SquatterCannotFrontRunApprovedOperator() public {
        _approveViaAgent(operator);
        // Attacker sees the approval land and races to stake first — still fails.
        vm.prank(attacker);
        vm.expectRevert(AgentVaultV2.OperatorNotApproved.selector);
        vault.stake(agent, MIN_STAKE);

        // The consented operator succeeds.
        vm.prank(operator);
        vault.stake(agent, MIN_STAKE);
        assertEq(vault.operatorOf(agent), operator);
    }

    function test_FullExitClearsBindingSoAgentCanRebind() public {
        _approveViaAgent(operator);
        vm.startPrank(operator);
        vault.stake(agent, MIN_STAKE);
        vault.requestUnstake(agent);
        vm.warp(block.timestamp + vault.UNSTAKE_COOLDOWN());
        vault.withdrawStake(agent, MIN_STAKE);
        vm.stopPrank();

        assertEq(vault.operatorOf(agent), address(0));
        assertEq(vault.approvedOperatorOf(agent), address(0));

        // Agent consents to a NEW operator, who can now bond. No permanence.
        vm.prank(agent);
        vault.approveOperator(attacker); // (any wallet the agent chooses)
        vm.prank(attacker);
        vault.stake(agent, MIN_STAKE);
        assertEq(vault.operatorOf(agent), attacker);
    }

    // --- consent paths --------------------------------------------------------

    function test_ApproveOperatorDirect() public {
        _approveViaAgent(operator);
        assertEq(vault.approvedOperatorOf(agent), operator);
    }

    function test_ApproveZeroOperatorReverts() public {
        vm.prank(agent);
        vm.expectRevert(AgentVaultV2.ZeroAddress.selector);
        vault.approveOperator(address(0));
    }

    function test_ApproveOperatorForWithSignature() public {
        bytes memory sig = _signApproval(operator, 0, block.timestamp + 1 hours);
        // Anyone can relay.
        vm.prank(attacker);
        vault.approveOperatorFor(agent, operator, block.timestamp + 1 hours, sig);
        assertEq(vault.approvedOperatorOf(agent), operator);

        vm.prank(operator);
        vault.stake(agent, MIN_STAKE);
        assertEq(vault.operatorOf(agent), operator);
    }

    function test_ApprovalSignatureIsSingleUse() public {
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _signApproval(operator, 0, deadline);
        vault.approveOperatorFor(agent, operator, deadline, sig);
        // Nonce advanced — replaying the same signature fails.
        vm.expectRevert(AgentVaultV2.BadSignature.selector);
        vault.approveOperatorFor(agent, operator, deadline, sig);
    }

    function test_ExpiredApprovalSignatureReverts() public {
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _signApproval(operator, 0, deadline);
        vm.warp(deadline + 1);
        vm.expectRevert(AgentVaultV2.Expired.selector);
        vault.approveOperatorFor(agent, operator, deadline, sig);
    }

    function test_ApprovalSignatureBoundToOperator() public {
        // Signed for `operator`; attacker tries to substitute themselves.
        bytes memory sig = _signApproval(operator, 0, block.timestamp + 1 hours);
        vm.expectRevert(AgentVaultV2.BadSignature.selector);
        vault.approveOperatorFor(agent, attacker, block.timestamp + 1 hours, sig);
    }

    function test_HighSSignatureRejected() public {
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _signApproval(operator, 0, deadline);
        // Malleate: s' = N - s, v' = flip(v).
        (bytes32 r, bytes32 s, uint8 v) = _split(sig);
        uint256 N =
            0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141;
        bytes memory malleated =
            abi.encodePacked(r, bytes32(N - uint256(s)), v == 27 ? uint8(28) : uint8(27));
        vm.expectRevert(AgentVaultV2.BadSignature.selector);
        vault.approveOperatorFor(agent, operator, deadline, malleated);
    }

    function _split(bytes memory sig)
        internal
        pure
        returns (bytes32 r, bytes32 s, uint8 v)
    {
        assembly {
            r := mload(add(sig, 32))
            s := mload(add(sig, 64))
            v := byte(0, mload(add(sig, 96)))
        }
    }

    // --- V1 behavior preserved --------------------------------------------------

    function test_StakeBelowMinReverts() public {
        _approveViaAgent(operator);
        vm.prank(operator);
        vm.expectRevert(AgentVaultV2.BelowMinStake.selector);
        vault.stake(agent, MIN_STAKE - 1);
    }

    function test_OnlyBoundOperatorCanManage() public {
        _approveViaAgent(operator);
        vm.prank(operator);
        vault.stake(agent, MIN_STAKE);

        // Even a later agent-approval of someone else can't displace the
        // bound operator while their bond is live.
        vm.prank(agent);
        vault.approveOperator(attacker);
        vm.prank(attacker);
        vm.expectRevert(AgentVaultV2.WrongOperator.selector);
        vault.stake(agent, MIN_STAKE);

        vm.prank(attacker);
        vm.expectRevert(AgentVaultV2.NotOperator.selector);
        vault.requestUnstake(agent);
    }

    function test_PartialWithdrawKeepsBinding() public {
        _approveViaAgent(operator);
        vm.startPrank(operator);
        vault.stake(agent, MIN_STAKE * 2);
        vault.requestUnstake(agent);
        vm.warp(block.timestamp + vault.UNSTAKE_COOLDOWN());
        vault.withdrawStake(agent, MIN_STAKE); // leaves exactly minStake
        vm.stopPrank();
        assertEq(vault.operatorOf(agent), operator);
        assertEq(vault.stakeOf(agent), MIN_STAKE);
    }

    function test_WithdrawLeavingDustReverts() public {
        _approveViaAgent(operator);
        vm.startPrank(operator);
        vault.stake(agent, 100 ether);
        vault.requestUnstake(agent);
        vm.warp(block.timestamp + vault.UNSTAKE_COOLDOWN());
        vm.expectRevert(AgentVaultV2.BelowMinStake.selector);
        vault.withdrawStake(agent, 60 ether);
        vm.stopPrank();
    }
}
