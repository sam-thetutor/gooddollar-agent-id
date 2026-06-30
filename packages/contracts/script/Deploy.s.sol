// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {AgentVault} from "../src/AgentVault.sol";
import {IERC20} from "../src/IERC20.sol";

/// @notice Deploys AgentVault bound to the G$ token.
///
/// Usage (Alfajores testnet):
///   export PRIVATE_KEY=0x...
///   export ALFAJORES_RPC_URL=https://alfajores-forno.celo-testnet.org
///   export GDOLLAR_TOKEN=0x03d3daB843e6c03b3d271eff9178e6A96c28D25f
///   forge script script/Deploy.s.sol --rpc-url alfajores --broadcast
///
/// Usage (Celo mainnet):
///   export PRIVATE_KEY=0x...
///   export CELO_RPC_URL=https://forno.celo.org
///   export GDOLLAR_TOKEN=0x62B8B11039FcfE5aB0C56E502b1C372A3d2a9c7A
///   forge script script/Deploy.s.sol --rpc-url celo --broadcast --verify
contract Deploy is Script {
    // GoodDollar (G$) on Celo mainnet — used as the default if GDOLLAR_TOKEN
    // is not set in the environment.
    address constant G_DOLLAR_CELO =
        0x62B8B11039FcfE5aB0C56E502b1C372A3d2a9c7A;

    // Required refundable bond to register an agent: 250 G$ (18 decimals).
    uint256 constant DEFAULT_MIN_STAKE = 250e18;

    function run() external returns (AgentVault vault) {
        address token = vm.envOr("GDOLLAR_TOKEN", G_DOLLAR_CELO);
        uint256 minStake = vm.envOr("MIN_STAKE", DEFAULT_MIN_STAKE);
        uint256 pk = vm.envUint("PRIVATE_KEY");

        vm.startBroadcast(pk);
        vault = new AgentVault(IERC20(token), minStake);
        vm.stopBroadcast();

        console2.log("AgentVault deployed at:", address(vault));
        console2.log("G$ token:", token);
        console2.log("minStake:", minStake);
    }
}
