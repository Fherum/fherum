// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Script, console2} from "forge-std/Script.sol";
import {ChainIds} from "../src/ChainIds.sol";

/// @notice Dry-run stub for Robinhood testnet 46630.
/// @dev This script never broadcasts. It does not read a private key. `--broadcast` has nothing to send
///      because `run` does not call `vm.startBroadcast`. Set `FHERUM_BROADCAST=true` and the script reverts.
///      RPC, when an operator later deploys by hand: https://rpc.testnet.chain.robinhood.com
///      Mainnet 4663 is out of scope for G2. privacyMode of any deployed market is Public.
contract DeployRobinhoodTestnet is Script {
    error BroadcastRefused();

    function run() external view {
        if (vm.envOr("FHERUM_BROADCAST", false)) revert BroadcastRefused();

        console2.log("FHERUM G2 dry run. No transactions. No private key.");
        console2.log("Robinhood testnet chain id", ChainIds.ROBINHOOD_TESTNET);
        console2.log("Robinhood mainnet chain id", ChainIds.ROBINHOOD_MAINNET);
        console2.log("RPC https://rpc.testnet.chain.robinhood.com");
        console2.log("Current chain id", block.chainid);

        if (block.chainid != ChainIds.ROBINHOOD_TESTNET && block.chainid != ChainIds.ANVIL) {
            console2.log("No action. This stub only describes a 46630 deployment.");
            return;
        }

        console2.log("Intended order, after an audit, with a governor Safe:");
        console2.log("1. PlaintextFHEAdapter");
        console2.log("2. RiskEngine(adapter)");
        console2.log("3. LiquidationEngine");
        console2.log("4. EmergencyController(governor, guardian)");
        console2.log("5. OracleAdapter(governor)");
        console2.log("6. InterestRateModel");
        console2.log("7. LiquidityHub(governor)");
        console2.log("8. Market, then registerSpoke, allowlist, feeds, credit line");
        console2.log("privacyMode is Public. Do not describe the deployment as live FHE.");
    }
}
