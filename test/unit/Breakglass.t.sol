// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {LiquidityHub} from "../../src/LiquidityHub.sol";
import {Market} from "../../src/Market.sol";
import {G4Fixture} from "../utils/G4Fixture.sol";

contract BreakglassTest is G4Fixture {
    function test_pauseTaxonomyNeverBlocksRepay() public {
        vm.startPrank(alice);
        market.supply(1_000e18);
        market.addCollateral(1_000e18);
        market.borrow(100e18);
        vm.stopPrank();

        uint256 hubBefore = borrowToken.balanceOf(address(hub));
        uint256 guardianBefore = borrowToken.balanceOf(guardian);

        vm.prank(guardian);
        emergency.pause(address(market));
        assertEq(borrowToken.balanceOf(address(hub)), hubBefore);
        assertEq(borrowToken.balanceOf(guardian), guardianBefore);

        (bool borrowPaused, bool collateralPaused, bool liquidationPaused, bool repayPaused) =
            emergency.pauseFlags(address(market));
        assertTrue(borrowPaused);
        assertTrue(collateralPaused);
        assertTrue(liquidationPaused);
        assertFalse(repayPaused);
        assertFalse(emergency.repayPaused(address(market)));
        assertTrue(emergency.paused(address(market)));

        vm.expectRevert(Market.MarketPaused.selector);
        vm.prank(alice);
        market.borrow(1e18);
        vm.expectRevert(Market.MarketPaused.selector);
        vm.prank(alice);
        market.removeCollateral(1e18);
        vm.expectRevert(Market.MarketPaused.selector);
        vm.prank(liquidator);
        market.liquidate(alice, 1e18);

        vm.prank(alice);
        market.supply(1e18);
        vm.prank(alice);
        market.withdraw(1e18);
        uint256 debtBefore = market.debtAssets(alice);
        vm.prank(bob);
        market.repay(alice, 10e18);
        assertLt(market.debtAssets(alice), debtBefore);
        assertGt(market.debtAssets(alice), 0);
        assertFalse(emergency.repayPaused(address(market)));
        assertGt(borrowToken.balanceOf(address(hub)), hubBefore);
        assertEq(borrowToken.balanceOf(guardian), guardianBefore);

        vm.expectRevert();
        vm.prank(guardian);
        emergency.unpause(address(market));
        vm.prank(governor);
        emergency.unpause(address(market));
        assertFalse(emergency.paused(address(market)));
        assertFalse(emergency.repayPaused(address(market)));
    }

    function test_guardianCannotMoveFundsOrParameters() public {
        Market spoke = _createCuratedMarket();
        _approveSpoke(alice, spoke);
        vm.prank(alice);
        spoke.supply(100e18);

        uint256 cash = hub.cashOf(address(spoke), address(borrowToken), LiquidityHub.BucketKind.Liquidity);
        assertEq(cash, 100e18);

        vm.prank(guardian);
        vm.expectRevert(LiquidityHub.NotSpoke.selector);
        hub.withdraw(address(borrowToken), LiquidityHub.BucketKind.Liquidity, guardian, 1);

        vm.prank(guardian);
        vm.expectRevert();
        hub.draw(address(borrowToken), guardian, 1);

        vm.prank(guardian);
        vm.expectRevert();
        spoke.setRiskParams(0.5e18, 0.8e18, 1.05e18, 0.5e18, 0.1e18, 0);

        vm.prank(guardian);
        vm.expectRevert();
        spoke.setFeeRecipient(guardian);

        vm.prank(guardian);
        vm.expectRevert();
        registry.queueRiskParams(address(spoke), 0.5e18, 0.8e18, 1.05e18, 0.5e18, 0.1e18, 0);

        assertEq(hub.cashOf(address(spoke), address(borrowToken), LiquidityHub.BucketKind.Liquidity), 100e18);
        assertEq(borrowToken.balanceOf(guardian), 0);
        assertFalse(spoke.hasRole(spoke.CURATOR_ROLE(), guardian));
        assertFalse(spoke.hasRole(spoke.DEFAULT_ADMIN_ROLE(), guardian));
        assertFalse(hub.hasRole(hub.DEFAULT_ADMIN_ROLE(), guardian));
        assertFalse(timelock.hasRole(timelock.PROPOSER_ROLE(), guardian));
        assertFalse(timelock.hasRole(timelock.CANCELLER_ROLE(), guardian));
        assertFalse(liquidation.socializesBadDebt());
    }

    function test_liquidationEndToEndRespectsBonusAndPause() public {
        vm.prank(alice);
        market.supply(10_000e18);
        vm.startPrank(bob);
        market.addCollateral(1_000e18);
        market.borrow(700e18);
        vm.stopPrank();

        vm.prank(liquidator);
        vm.expectRevert(Market.NotLiquidatable.selector);
        market.liquidate(bob, 100e18);

        collateralFeed.setAnswer(0.5e8);
        assertLt(market.healthFactorWad(bob), 1e18);

        vm.prank(guardian);
        emergency.pause(address(market));
        vm.prank(liquidator);
        vm.expectRevert(Market.MarketPaused.selector);
        market.liquidate(bob, type(uint256).max);
        vm.prank(bob);
        market.repay(bob, 50e18);
        assertEq(market.debtAssets(bob), 650e18);

        vm.prank(governor);
        emergency.unpause(address(market));
        _poke();

        uint256 debtBefore = market.debtAssets(bob);
        uint256 collateralBefore = collateralToken.balanceOf(liquidator);
        uint256 borrowBefore = borrowToken.balanceOf(liquidator);
        vm.prank(liquidator);
        market.liquidate(bob, type(uint256).max);

        uint256 repaid = debtBefore - market.debtAssets(bob);
        uint256 seized = collateralToken.balanceOf(liquidator) - collateralBefore;
        uint256 spent = borrowBefore - borrowToken.balanceOf(liquidator);
        assertEq(spent, repaid);
        assertLe(repaid, debtBefore / 2);
        assertGt(repaid, 300e18);
        assertGt(seized, 0);
        assertLt(market.collateralAssets(bob), collateralBefore);
        assertLt(market.debtAssets(bob), debtBefore);

        uint256 repayValue = repaid;
        uint256 seizeValue = seized / 2;
        assertLe(seizeValue * 1e18, repayValue * market.liquidationBonusWad());
    }

    function test_badDebtRemainsWhenCollateralCannotCover() public {
        assertFalse(liquidation.socializesBadDebt());

        vm.prank(alice);
        market.supply(10_000e18);
        vm.startPrank(bob);
        market.addCollateral(1_000e18);
        market.borrow(700e18);
        vm.stopPrank();

        collateralFeed.setAnswer(0.5e8);
        _poke();

        uint256 steps;
        while (steps < 8) {
            vm.prank(liquidator);
            try market.liquidate(bob, type(uint256).max) {
                steps++;
            } catch {
                break;
            }
        }

        assertGt(steps, 0);
        assertGt(market.debtAssets(bob), 0);
        assertLt(market.collateralAssets(bob), 1e12);
        assertEq(market.totalCollateral(), market.collateralAssets(bob));
        assertFalse(liquidation.socializesBadDebt());
    }
}
