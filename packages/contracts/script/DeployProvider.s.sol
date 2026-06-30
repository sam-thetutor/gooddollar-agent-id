// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {
    GoodDollarHumanProofProvider,
    IGoodDollarIdentity
} from "../src/GoodDollarHumanProofProvider.sol";

/// @notice Deploys the GoodDollarHumanProofProvider, an ERC-8004
///         `IHumanProofProvider` backed by the GoodDollar on-chain identity
///         whitelist.
///
/// Usage (Celo mainnet):
///   export PRIVATE_KEY=0x...
///   export CELO_RPC_URL=https://forno.celo.org
///   forge script script/DeployProvider.s.sol --rpc-url celo --broadcast
contract DeployProvider is Script {
    // GoodDollar Identity (IdentityV2) on Celo mainnet — default if
    // GDOLLAR_IDENTITY is not set.
    address constant G_DOLLAR_IDENTITY_CELO =
        0xC361A6E67822a0EDc17D899227dd9FC50BD62F42;

    function run() external returns (GoodDollarHumanProofProvider provider) {
        address identity = vm.envOr("GDOLLAR_IDENTITY", G_DOLLAR_IDENTITY_CELO);
        uint256 pk = vm.envUint("PRIVATE_KEY");

        vm.startBroadcast(pk);
        provider = new GoodDollarHumanProofProvider(IGoodDollarIdentity(identity));
        vm.stopBroadcast();

        console2.log("GoodDollarHumanProofProvider deployed at:", address(provider));
        console2.log("GoodDollar Identity:", identity);
        console2.log("providerName:", provider.providerName());
        console2.log("verificationStrength:", provider.verificationStrength());
    }
}
