// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {AssayRegistry} from "../../src/AssayRegistry.sol";
import {IERC8056} from "../../src/interfaces/IERC8056.sol";
import {IMarketStatus} from "../../src/interfaces/IMarketStatus.sol";
import {Market} from "../../src/Market.sol";
import {OracleAdapter} from "../../src/OracleAdapter.sol";

/// @notice Mainnet-fork rehearsal of ASSAY on the 12 live stock markets (chain 4663).
///         Deploys AssayRegistry, registers every stock token from baseline 1e18, records, then replays the
///         Safe `setMarketStatus` calls and checks every market stays open (all observed changes are dividends).
///         Run: FORK_URL=https://robinhood.drpc.org forge test --match-contract AssayFork -vv
contract AssayForkTest is Test {
    address constant SAFE = 0x3E7CEd699783751FBc7eb1545144DCe6C64D38CB;
    address constant TIMELOCK = 0x47cB8ee6CfDd18dA1450AC3a85a3179583Eb61A7;

    function _markets() internal pure returns (address[12] memory m) {
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

    function setUp() public {
        string memory url = vm.envOr("FORK_URL", string(""));
        if (bytes(url).length == 0) vm.skip(true);
        vm.createSelectFork(url);
    }

    function test_assay_liveTokens() public {
        address[12] memory ms = _markets();
        OracleAdapter oracle = Market(ms[0]).oracle();
        AssayRegistry assay = new AssayRegistry(SAFE, TIMELOCK, oracle);

        uint256 dividends;
        vm.startPrank(SAFE);
        for (uint256 i; i < ms.length; ++i) {
            address t = Market(ms[i]).collateralAsset();
            assay.register(t, 1e18);
            oracle.setMarketStatus(t, IMarketStatus(address(assay)));
        }
        vm.stopPrank();

        for (uint256 i; i < ms.length; ++i) {
            address t = Market(ms[i]).collateralAsset();
            uint256 m = IERC8056(t).uiMultiplier();
            assertTrue(assay.isOpen(t), "open before record (in-band dividend)");
            assay.record(t);
            assertTrue(assay.isOpen(t), "open after record");
            assertEq(assay.dividendIndex(t), m, "index == multiplier since launch");
            assertEq(uint8(assay.status(t).state), uint8(AssayRegistry.State.NORMAL));
            if (m != 1e18) ++dividends;
            emit log_named_decimal_uint(string.concat(vm.toString(t), " dividendIndex"), m, 18);

            uint256 g = gasleft();
            assay.isOpen(t);
            emit log_named_uint("  isOpen gas", g - gasleft());
        }
        assertEq(dividends, 8, "8 dividend tokens per brief 5.3");
    }
}
