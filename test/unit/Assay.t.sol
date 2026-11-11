// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {AssayRegistry} from "../../src/AssayRegistry.sol";
import {IMarketStatus} from "../../src/interfaces/IMarketStatus.sol";
import {Market} from "../../src/Market.sol";
import {OracleAdapter} from "../../src/OracleAdapter.sol";
import {MockAggregatorV3} from "../mocks/MockAggregatorV3.sol";
import {MockStockToken} from "../mocks/MockStockToken.sol";
import {ProtocolFixture} from "../utils/ProtocolFixture.sol";

contract AssayTest is ProtocolFixture {
    AssayRegistry internal assay;
    MockStockToken internal stock;
    MockAggregatorV3 internal stockFeed;
    Market internal sm;
    address internal timelock = makeAddr("timelock");

    function setUp() public override {
        super.setUp();
        stock = new MockStockToken("SPY", "SPY");
        stockFeed = new MockAggregatorV3(8, 100e8);
        _listAsset(address(stock), address(stockFeed), 18);
        sm = _newMarket(address(stock), address(borrowToken));
        _register(sm, 800_000e18);

        assay = new AssayRegistry(governor, timelock, oracle);
        vm.startPrank(governor);
        assay.register(address(stock), 1e18);
        oracle.setMarketStatus(address(stock), IMarketStatus(address(assay)));
        vm.stopPrank();

        for (uint256 i; i < 3; ++i) {
            address u = i == 0 ? alice : i == 1 ? bob : liquidator;
            stock.mint(u, 1_000e18);
            borrowToken.mint(u, 100_000e18);
            vm.startPrank(u);
            stock.approve(address(sm), type(uint256).max);
            borrowToken.approve(address(sm), type(uint256).max);
            vm.stopPrank();
        }
        vm.prank(bob);
        sm.supply(50_000e18);
        vm.startPrank(alice);
        sm.addCollateral(100e18); // $10,000
        sm.borrow(1_000e18);
        vm.stopPrank();
    }

    function _closed() internal view returns (bytes memory) {
        return abi.encodeWithSelector(OracleAdapter.MarketClosed.selector, address(stock));
    }

    function _assertSafeActionsOpen() internal {
        vm.startPrank(alice);
        sm.repay(alice, 10e18);
        sm.addCollateral(1e18);
        vm.stopPrank();
        vm.startPrank(bob);
        sm.supply(1e18);
        sm.withdraw(1e18);
        vm.stopPrank();
    }

    function _assertRiskClosed() internal {
        vm.startPrank(alice);
        vm.expectRevert(_closed());
        sm.borrow(1e18);
        vm.expectRevert(_closed());
        sm.removeCollateral(1e18);
        vm.stopPrank();
        vm.prank(liquidator);
        vm.expectRevert(_closed());
        sm.liquidate(alice, 1e18);
    }

    // ---------------------------------------------------------------- dividends

    /// Real SPY/AAPL-sized steps: all DIVIDEND, never paused, index = product of ratios (≤1 wei per step).
    function test_dividendStepsCompoundWithoutPause() public {
        uint256[5] memory steps = [uint256(1.000566e18), 1.000412e18, 1.000183e18, 1.0017e18, 1.000700e18];
        uint256 m = 1e18;
        uint256 expected = 1e18;
        for (uint256 i; i < steps.length; ++i) {
            uint256 next = m * steps[i] / 1e18;
            vm.warp(block.timestamp + 90 days);
            stockFeed.setAnswer(100e8);
            _poke();
            stock.setMultiplier(next);
            assertTrue(assay.isOpen(address(stock)), "dividend unrecorded stays open");
            assay.record(address(stock));
            expected = expected * (next * 1e18 / m) / 1e18;
            m = next;
            assertTrue(assay.isOpen(address(stock)));
            vm.prank(alice);
            sm.borrow(1e18);
        }
        assertApproxEqAbs(assay.dividendIndex(address(stock)), expected, steps.length);
        assertApproxEqRel(assay.dividendIndex(address(stock)), m, 1e6);
        assertEq(assay.historyLength(address(stock)), 5);
    }

    function test_baselineCatchUpIsOneDividend() public {
        stock.setMultiplier(1.001717991187472003e18); // SPY onchain value
        assay.record(address(stock));
        assertEq(assay.dividendIndex(address(stock)), 1.001717991187472003e18);
        assertTrue(assay.isOpen(address(stock)));
    }

    /// uiMultiplier() read on chain 4663 for all 12 listed stock tokens (cast call, 2026-11-11).
    /// Every one must classify as DIVIDEND (or no change) from the 1e18 launch baseline.
    function test_liveMainnetMultipliersAllDividendOrUnchanged() public {
        uint256[12] memory live = [
            uint256(1e18), // COIN
            1001717991187472003, // SPY
            1e18, // SPCX
            1000193924414112587, // GOOGL
            1000700791241405425, // QQQ
            1000541459879451635, // META
            1000566080061092436, // AAPL
            1e18, // AMZN
            1000412952576205964, // MSFT
            1000183456682946507, // MU
            1e18, // TSLA
            1000775159164630595 // NVDA
        ];
        uint256 dividends;
        for (uint256 i; i < live.length; ++i) {
            MockStockToken t = new MockStockToken("S", "S");
            vm.prank(governor);
            assay.register(address(t), 1e18);
            t.setMultiplier(live[i]);
            assertTrue(assay.isOpen(address(t)));
            assay.record(address(t));
            assertTrue(assay.isOpen(address(t)));
            assertEq(assay.dividendIndex(address(t)), live[i]);
            if (live[i] != 1e18) ++dividends;
        }
        assertEq(dividends, 8);
    }

    // ---------------------------------------------------------- corporate action

    function _splitCase(uint256 newMult) internal {
        uint256 idx = assay.dividendIndex(address(stock));
        stock.setMultiplier(newMult);
        // keeper dead: live detection already closes risk
        assertFalse(assay.isOpen(address(stock)));
        _assertRiskClosed();
        _assertSafeActionsOpen();
        assay.record(address(stock));
        AssayRegistry.StatusView memory s = assay.status(address(stock));
        assertEq(uint8(s.state), uint8(AssayRegistry.State.CORP_ACTION_ACTIVE));
        assertEq(assay.dividendIndex(address(stock)), idx, "split adds no dividend");
        _assertRiskClosed();
        _assertSafeActionsOpen();
    }

    function test_split1to3() public {
        _splitCase(3e18);
    }

    function test_split1to10() public {
        _splitCase(10e18);
    }

    function test_reverseSplit10to1() public {
        _splitCase(0.1e18);
    }

    function test_mixedSplitPlusDividendIsCorpAction() public {
        _splitCase(3.00135e18);
    }

    function test_settleAfterRepriceReopens() public {
        _splitCase(3e18);
        vm.warp(block.timestamp + 2 hours);
        stockFeed.setAnswer(101e8); // total-return feed: per-token value ~unchanged
        _poke();
        assay.settle(address(stock));
        assertTrue(assay.isOpen(address(stock)));
        vm.prank(alice);
        sm.borrow(1e18);
    }

    function test_noSettleBeforeWindowOrFreshPrice() public {
        _splitCase(3e18);
        vm.warp(block.timestamp + 1 hours);
        stockFeed.setAnswer(100e8);
        assay.settle(address(stock));
        assertFalse(assay.isOpen(address(stock)), "settle window not elapsed");
        vm.warp(block.timestamp + 2 hours);
        stockFeed.setUpdatedAt(block.timestamp - 4 hours); // stale
        assay.settle(address(stock));
        assertFalse(assay.isOpen(address(stock)), "stale price");
    }

    function test_sanityFailIsUnexplainedUntilSafeResolves() public {
        _splitCase(3e18);
        vm.warp(block.timestamp + 2 hours);
        stockFeed.setAnswer(40e8); // feed out of sync: -60% per token
        assay.settle(address(stock));
        assertEq(uint8(assay.status(address(stock)).state), uint8(AssayRegistry.State.UNEXPLAINED));
        stockFeed.setAnswer(100e8);
        assay.settle(address(stock));
        assertFalse(assay.isOpen(address(stock)), "only Safe reopens UNEXPLAINED");
        _assertSafeActionsOpen();

        uint64 id = assay.status(address(stock)).eventId;
        vm.expectRevert();
        assay.resolve(address(stock), id, AssayRegistry.Class.CORP_ACTION, 0, keccak256("doc"));
        vm.prank(governor);
        vm.expectRevert(AssayRegistry.MissingReason.selector);
        assay.resolve(address(stock), id, AssayRegistry.Class.CORP_ACTION, 0, bytes32(0));
        vm.prank(governor);
        assay.resolve(address(stock), id, AssayRegistry.Class.CORP_ACTION, 1.0013e18, keccak256("issuer notice"));
        assertTrue(assay.isOpen(address(stock)));
        assertEq(assay.dividendIndex(address(stock)), 1.0013e18);
    }

    function test_smallDecreaseIsUnexplained() public {
        stock.setMultiplier(0.998e18); // -0.2%, inside 0.5% tolerance
        assertFalse(assay.isOpen(address(stock)));
        assay.record(address(stock));
        assertEq(uint8(assay.status(address(stock)).state), uint8(AssayRegistry.State.UNEXPLAINED));
        _assertRiskClosed();
        _assertSafeActionsOpen();
    }

    function test_dividendWhileIssuerPausedIsCorpAction() public {
        stock.setOraclePaused(true);
        stock.setMultiplier(1.001e18);
        assay.record(address(stock));
        assertEq(uint8(assay.status(address(stock)).state), uint8(AssayRegistry.State.CORP_ACTION_ACTIVE));
        assertEq(assay.dividendIndex(address(stock)), 1e18);
    }

    // ----------------------------------------------------- issuer pause / revert

    function test_issuerPauseClosesAndReopens() public {
        stock.setOraclePaused(true);
        assertFalse(assay.isOpen(address(stock)));
        assertEq(uint8(assay.status(address(stock)).state), uint8(AssayRegistry.State.ISSUER_PAUSED));
        _assertRiskClosed();
        _assertSafeActionsOpen();
        stock.setOraclePaused(false);
        assertTrue(assay.isOpen(address(stock)));
    }

    function test_tokenRevertFailsClosed() public {
        stock.setRevertOraclePaused(true);
        _assertRiskClosed();
        _assertSafeActionsOpen();
    }

    function test_unregisteredAssetClosed() public view {
        assertFalse(assay.isOpen(address(collateralToken)));
    }

    // ------------------------------------------------------------------ pending

    function test_scheduledSplitClosesInsidePreEventWindow() public {
        uint256 at = block.timestamp + 1 days;
        stock.schedule(3e18, at);
        vm.expectEmit(true, false, false, true);
        emit AssayRegistry.CorporateActionScheduled(address(stock), 1e18, 3e18, at);
        assay.record(address(stock));
        assertTrue(assay.isOpen(address(stock)), "open before window");
        assertEq(uint8(assay.status(address(stock)).state), uint8(AssayRegistry.State.CORP_ACTION_PENDING));
        vm.warp(at - 30 minutes);
        stockFeed.setAnswer(100e8);
        assertFalse(assay.isOpen(address(stock)), "closed inside 1h window");
        vm.warp(at);
        assertFalse(assay.isOpen(address(stock)), "split now live, unrecorded");
    }

    function test_scheduledDividendStaysOpen() public {
        stock.schedule(1.0005e18, block.timestamp + 1 days);
        assay.record(address(stock));
        vm.warp(block.timestamp + 1 days - 10 minutes);
        assertTrue(assay.isOpen(address(stock)));
    }

    // ------------------------------------------------------------------- params

    function test_paramsTightenBySafeLoosenOnlyByTimelock() public {
        AssayRegistry.Params memory p = assay.defaultParams();
        p.maxDividendStepBps = 200;
        vm.prank(governor);
        vm.expectRevert(AssayRegistry.LooseningNeedsTimelock.selector);
        assay.setParams(address(stock), p);
        vm.prank(timelock);
        assay.setParams(address(stock), p);

        p.maxDividendStepBps = 50;
        vm.prank(governor);
        assay.setParams(address(stock), p);

        p.maxDividendStepBps = 400; // above hard cap
        vm.prank(timelock);
        vm.expectRevert(AssayRegistry.BadParams.selector);
        assay.setParams(address(stock), p);

        AssayRegistry.Params memory d = assay.defaultParams();
        vm.prank(alice);
        vm.expectRevert();
        assay.setParams(address(stock), d);
    }

    // --------------------------------------------------------------------- gas

    function test_gasIsOpen() public {
        uint256 g = gasleft();
        assay.isOpen(address(stock));
        uint256 used = g - gasleft();
        emit log_named_uint("isOpen gas", used);
        assertLt(used, 30_000);
    }

    // ---------------------------------------------- invariant: repay never blocked

    function testFuzz_repayNeverBlockedByAssay(uint256 mult, bool paused, bool rev, uint32 dt, uint8 action) public {
        mult = bound(mult, 1, 100e18);
        if (action % 3 == 0) stock.setMultiplier(mult);
        else if (action % 3 == 1) stock.schedule(mult, block.timestamp + bound(dt, 0, 2 days));
        stock.setOraclePaused(paused);
        if (action % 2 == 0) {
            try assay.record(address(stock)) {} catch {}
        }
        vm.warp(block.timestamp + dt);
        stock.setRevertOraclePaused(rev);
        vm.startPrank(alice);
        sm.repay(alice, 1e18);
        sm.addCollateral(1e18);
        sm.repay(alice, type(uint256).max);
        vm.stopPrank();
        vm.startPrank(bob);
        sm.supply(1e18);
        sm.withdraw(1e18);
        vm.stopPrank();
    }
}
