// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {AgentRevocation, IAgentVaultOperator} from "../src/AgentRevocation.sol";

/// @notice Deploys AgentRevocation bound to the live AgentVault.
///
/// Usage (Celo mainnet):
///   export PRIVATE_KEY=0x...
///   export CELO_RPC_URL=https://forno.celo.org
///   export AGENT_VAULT_ADDRESS=0x0409042B55e99Df8c0Feb7525A770838f3A47090
///   forge script script/DeployRevocation.s.sol --rpc-url celo --broadcast
contract DeployRevocation is Script {
    // Live AgentVault on Celo mainnet (default if AGENT_VAULT_ADDRESS unset).
    address constant AGENT_VAULT_CELO =
        0x0409042B55e99Df8c0Feb7525A770838f3A47090;

    function run() external returns (AgentRevocation revocation) {
        address vault = vm.envOr("AGENT_VAULT_ADDRESS", AGENT_VAULT_CELO);
        uint256 pk = vm.envUint("PRIVATE_KEY");

        vm.startBroadcast(pk);
        revocation = new AgentRevocation(IAgentVaultOperator(vault));
        vm.stopBroadcast();

        console2.log("AgentRevocation deployed at:", address(revocation));
        console2.log("bound to AgentVault:", vault);
    }
}
