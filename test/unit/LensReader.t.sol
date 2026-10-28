// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {EmergencyController} from "../../src/EmergencyController.sol";
import {LensReader} from "../../src/LensReader.sol";
import {Market} from "../../src/Market.sol";
import {PrivacyMode} from "../../src/types/PrivacyMode.sol";
import {ReserveAccounting} from "../../src/libraries/ReserveAccounting.sol";
import {G4Fixture} from "../utils/G4Fixture.sol";

contract LensReaderTest is G4Fixture {
    function test_snapshotMatchesAccounting() public {
        vm.prank(alice);
        market.supply(1_000e18);
        vm.startPrank(bob);
        market.addCollateral(800e18);
        market.borrow(400e18);
        vm.stopPrank();

        LensReader.MarketSnapshot memory snap = lens.snapshot(market);
        assertEq(snap.totalSupplyAssets, market.totalSupplyAssets());
        assertEq(snap.totalDebtAssets, market.totalDebtAssets());
        assertEq(snap.totalSupplyShares, market.totalSupplyShares());
        assertEq(snap.totalBorrowShares, market.totalBorrowShares());
        assertEq(snap.totalCollateral, market.totalCollateral());
        assertEq(snap.availableLiquidity, market.availableLiquidity());
        assertEq(snap.totalSupplyAssets, 1_000e18);
        assertEq(snap.totalDebtAssets, 400e18);
        assertEq(snap.totalCollateral, 800e18);
        assertEq(snap.availableLiquidity, 600e18);
        assertEq(snap.utilizationWad, ReserveAccounting.utilizationWad(snap.totalDebtAssets, snap.totalSupplyAssets));
        (uint256 util, uint256 borrowRate, uint256 supplyRate) = market.previewRates();
        assertEq(snap.utilizationWad, util);
        assertEq(snap.borrowRatePerYearWad, borrowRate);
        assertEq(snap.supplyRatePerYearWad, supplyRate);
        assertEq(snap.utilizationWad, 0.4e18);
        assertEq(snap.borrowRatePerYearWad, 0.02e18);
        assertEq(snap.supplyRatePerYearWad, 0.0072e18);

        (uint256 supplyCap, uint256 borrowCap, uint256 walletSupplyCap, uint256 walletBorrowCap) = market.caps();
        assertEq(snap.supplyCap, supplyCap);
        assertEq(snap.borrowCap, borrowCap);
        assertEq(snap.walletSupplyCap, walletSupplyCap);
        assertEq(snap.walletBorrowCap, walletBorrowCap);
        assertEq(snap.supplyCap, 1_000_000e18);
        assertEq(snap.ltvWad, market.ltvWad());
        assertEq(snap.liquidationThresholdWad, market.liquidationThresholdWad());
        assertEq(snap.liquidationBonusWad, market.liquidationBonusWad());
        assertEq(snap.closeFactorWad, market.closeFactorWad());
        assertEq(snap.reserveFactorWad, market.reserveFactorWad());
        assertEq(snap.dustValueWad, market.dustValueWad());
        assertEq(snap.supplyIndex, market.supplyIndex());
        assertEq(snap.borrowIndex, market.borrowIndex());
        assertFalse(snap.paused);
        assertFalse(snap.borrowPaused);
        assertFalse(snap.removeCollateralPaused);
        assertFalse(snap.liquidationPaused);
        assertFalse(snap.repayPaused);
        assertEq(snap.privacyMode, uint8(PrivacyMode.Public));
        assertEq(snap.eligibility, address(0));

        LensReader.UserSnapshot memory aliceView = lens.userSnapshot(market, alice);
        assertEq(aliceView.supplyShares, market.supplyShares(alice));
        assertEq(aliceView.supplyAssets, ReserveAccounting.supplyAssets(aliceView.supplyShares, market.supplyIndex()));
        assertEq(aliceView.supplyAssets, 1_000e18);
        assertEq(aliceView.debtAssets, market.debtAssets(alice));
        assertEq(aliceView.debtAssets, 0);
        assertEq(aliceView.healthFactorWad, market.healthFactorWad(alice));
        assertTrue(aliceView.eligible);

        LensReader.UserSnapshot memory bobView = lens.userSnapshot(market, bob);
        assertEq(bobView.collateralAssets, 800e18);
        assertEq(bobView.debtShares, market.debtShares(bob));
        assertEq(bobView.debtAssets, market.debtAssets(bob));
        assertEq(bobView.debtAssets, 400e18);
        assertEq(bobView.healthFactorWad, market.healthFactorWad(bob));
        assertEq(bobView.healthFactorWad, 1.7e18);
    }

    function test_pauseFlagsAndPrivacyOnCuratedMarket() public {
        Market spoke = _createCuratedMarket();
        _approveSpoke(alice, spoke);
        vm.prank(alice);
        spoke.supply(50e18);

        vm.prank(guardian);
        emergency.pause(address(spoke));

        LensReader.MarketSnapshot memory snap = lens.snapshot(spoke);
        assertTrue(snap.paused);
        assertTrue(snap.borrowPaused);
        assertTrue(snap.removeCollateralPaused);
        assertTrue(snap.liquidationPaused);
        assertFalse(snap.repayPaused);
        assertEq(snap.totalSupplyAssets, spoke.totalSupplyAssets());
        assertEq(snap.privacyMode, uint8(PrivacyMode.Public));
        assertEq(snap.privacyMode, uint8(spoke.privacyMode()));

        EmergencyController.Taxonomy memory taxonomy = emergency.taxonomy();
        assertFalse(taxonomy.supplyPausable);
        assertFalse(taxonomy.withdrawPausable);
        assertTrue(taxonomy.borrowPausable);
        assertTrue(taxonomy.removeCollateralPausable);
        assertTrue(taxonomy.liquidationPausable);
        assertFalse(taxonomy.repayPausable);
    }
}
