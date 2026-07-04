// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {AgentAttestation} from "../src/AgentAttestation.sol";

/// @notice Deploys AgentAttestation (agent key proof-of-possession registry).
///
/// Usage (Celo mainnet):
///   export PRIVATE_KEY=0x...
///   export CELO_RPC_URL=https://forno.celo.org
///   forge script script/DeployAttestation.s.sol --rpc-url celo --broadcast
contract DeployAttestation is Script {
    function run() external returns (AgentAttestation attestation) {
        uint256 pk = vm.envUint("PRIVATE_KEY");

        vm.startBroadcast(pk);
        attestation = new AgentAttestation();
        vm.stopBroadcast();

        console2.log("AgentAttestation deployed at:", address(attestation));
    }
}
