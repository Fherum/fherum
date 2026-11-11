// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Script, console2} from "forge-std/Script.sol";
import {AssayRegistry} from "../src/AssayRegistry.sol";
import {IMarketStatus} from "../src/interfaces/IMarketStatus.sol";
import {Market} from "../src/Market.sol";
import {OracleAdapter} from "../src/OracleAdapter.sol";

/// @notice M1 ASSAY rollout on Robinhood Chain mainnet. No market is redeployed.
///      Step 1 (deployer, you broadcast):
///        CONFIRM_MAINNET=yes forge script script/DeployAssay.s.sol --rpc-url <rpc> --account fherum-c199 --broadcast
///        Admin of the new AssayRegistry is the Safe; PARAMS_ROLE is the 48h Timelock. Deployer keeps no role.
///      Step 2 (Safe): import out/safe-batch-assay.json in Transaction Builder: per token
///        assay.register(token, 1e18) + oracle.setMarketStatus(token, assay)  (24 calls, one Safe tx).
///      Step 3 (anyone): cast send <assay> "record(address)" <token>  for each token (keeper; permissionless).
contract DeployAssay is Script {
    address constant SAFE = 0x3E7CEd699783751FBc7eb1545144DCe6C64D38CB;
    address constant TIMELOCK = 0x47cB8ee6CfDd18dA1450AC3a85a3179583Eb61A7;

    error NotConfirmed();

    function markets() public pure returns (address[12] memory m) {
        m = [
            0xbd603495e9267667309b50ADb533Ed6316189868, // COIN
            0xD0f9402F4aCdE4775d22D6bD5F26a3b387a991dF, // SPY
            0x7d8C5aE513F77E51B5Ce5D4f52d61436Be62Eb16, // SPCX
            0x2E97d8Eb400Ad2418499342630a295CBAFAA5EEc, // GOOGL
            0xbf42dCd5EbA55c3dE22AcCF0ad2ba080FB2448EF, // QQQ
            0x31c45ad8d37C762b458ed9361b3E4Af672046eA1, // META
            0x19dabE92D4c8dBEC53aA558B988ccbd7825589DC, // AAPL
            0x55027eF1f7EfbbF8EE042f5e0fc1Bd715647B6BC, // AMZN
            0xD68414C7E2C16B17EAc72FDF9A5711dDECb92abE, // MSFT
            0x8CB37699e1F9d64Ea08f0414C2Ec4dE1106eA703, // MU
            0x6dA5D9c84dAB4324dA4a532f0bdb6B01AAEc4E7E, // TSLA
            0xdF7a59D46F96693bb759Bf4B7F0B15FCa201DcC3 // NVDA
        ];
    }

    function run() external returns (AssayRegistry assay) {
        if (block.chainid == 4663 && keccak256(bytes(vm.envOr("CONFIRM_MAINNET", string("")))) != keccak256("yes")) {
            revert NotConfirmed();
        }
        address[12] memory ms = markets();
        OracleAdapter oracle = Market(ms[0]).oracle();

        vm.startBroadcast();
        assay = new AssayRegistry(SAFE, TIMELOCK, oracle);
        vm.stopBroadcast();

        string memory txs;
        for (uint256 i; i < ms.length; ++i) {
            if (Market(ms[i]).oracle() != oracle) revert("oracle mismatch");
            address t = Market(ms[i]).collateralAsset();
            txs = string.concat(
                txs,
                i == 0 ? "" : ",",
                _tx(address(assay), abi.encodeCall(AssayRegistry.register, (t, 1e18))),
                ",",
                _tx(address(oracle), abi.encodeCall(OracleAdapter.setMarketStatus, (t, IMarketStatus(address(assay)))))
            );
            console2.log(ms[i], t);
        }
        vm.writeFile(
            vm.envOr("SAFE_JSON_OUT", string("out/safe-batch-assay.json")),
            string.concat(
                '{"version":"1.0","chainId":"4663","meta":{"name":"FHERUM M1 ASSAY (12 stock tokens)","createdFromSafeAddress":"',
                vm.toString(SAFE),
                '"},"transactions":[',
                txs,
                "]}"
            )
        );
        console2.log("AssayRegistry", address(assay));
        console2.log("Safe batch written: out/safe-batch-assay.json (24 calls)");
    }

    function _tx(address to, bytes memory data) internal pure returns (string memory) {
        return string.concat(
            '{"to":"', vm.toString(to), '","value":"0","data":"', vm.toString(data), '","contractMethod":null,"contractInputsValues":null}'
        );
    }
}
