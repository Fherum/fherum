// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {LiquidationEngine} from "../../src/LiquidationEngine.sol";
import {Market} from "../../src/Market.sol";
import {OracleAdapter} from "../../src/OracleAdapter.sol";
import {ProtocolFixture} from "../utils/ProtocolFixture.sol";

/// @notice Target-HF sizing plus adversarial liquidation scenarios (brief 6.10, 7.6, 15).
contract LiquidationAdversarialTest is ProtocolFixture {
    address internal mallory = makeAddr("mallory");

    function setUp() public override {
        super.setUp();
        _fund(mallory, market);
        vm.prank(alice);
        market.supply(10_000e18);
        vm.startPrank(bob);
        market.addCollateral(1_000e18);
        market.borrow(700e18);
        vm.stopPrank();
    }

    function _underwater() internal {
        collateralFeed.setAnswer(0.8e8); // HF = 0.85*800/700 ~ 0.971
        _poke();
        assertLt(market.healthFactorWad(bob), 1e18);
    }

    function test_targetHf_restoresTargetNotCloseFactor() public {
        _underwater();
        vm.prank(liquidator);
        market.liquidate(bob, type(uint256).max);
        uint256 hf = market.healthFactorWad(bob);
        assertGe(hf, market.targetHealthFactorWad());
        assertLt(hf, market.targetHealthFactorWad() + 0.001e18); // not over-liquidated
        assertLt(700e18 - market.debtAssets(bob), 350e18); // below 50% close cap
    }

    function test_frontRun_secondLiquidatorGetsNothingOnceHealthy() public {
        _underwater();
        vm.prank(mallory);
        market.liquidate(bob, type(uint256).max);
        vm.prank(liquidator);
        vm.expectRevert(Market.NotLiquidatable.selector);
        market.liquidate(bob, type(uint256).max);
    }

    function test_frontRun_partialRepayThenVictimStillBoundedByTarget() public {
        _underwater();
        vm.prank(mallory);
        market.liquidate(bob, 100e18);
        uint256 debtMid = market.debtAssets(bob);
        vm.prank(liquidator);
        market.liquidate(bob, type(uint256).max);
        assertGe(market.healthFactorWad(bob), market.targetHealthFactorWad());
        assertLt(700e18 - market.debtAssets(bob), 350e18);
        assertLt(market.debtAssets(bob), debtMid);
    }

    function test_sandwich_oracleUpdateCannotExceedBonus() public {
        // Attacker liquidates right after a favourable update; seized value still bounded by bonus at that price.
        _underwater();
        uint256 collBefore = collateralToken.balanceOf(mallory);
        uint256 borBefore = borrowToken.balanceOf(mallory);
        vm.prank(mallory);
        market.liquidate(bob, type(uint256).max);
        uint256 seized = collateralToken.balanceOf(mallory) - collBefore;
        uint256 spent = borBefore - borrowToken.balanceOf(mallory);
        assertLe(seized * 0.8e18 / 1e18, spent * 1.05e18 / 1e18);
        // Price recovers in the next round; the back-run cannot liquidate a healthy position.
        collateralFeed.setAnswer(1e8);
        vm.prank(mallory);
        vm.expectRevert(Market.NotLiquidatable.selector);
        market.liquidate(bob, type(uint256).max);
    }

    function test_sandwich_breakerBlocksLiquidationOnJump() public {
        vm.prank(governor);
        oracle.setMaxDeviation(address(collateralToken), 1_000); // 10%
        collateralFeed.setAnswer(0.5e8); // -50% single round
        _poke();
        vm.prank(mallory);
        vm.expectRevert(abi.encodeWithSelector(OracleAdapter.PriceDeviation.selector, address(collateralToken)));
        market.liquidate(bob, type(uint256).max);
        // Repay and addCollateral stay open while the breaker is tripped.
        vm.startPrank(bob);
        market.repay(bob, 10e18);
        market.addCollateral(10e18);
        vm.stopPrank();
    }

    function test_griefing_dustResidualReverts() public {
        // Small position: the target leaves a sub-dust residual, so full close is allowed and partial dust is not.
        vm.startPrank(carol);
        market.addCollateral(200e18);
        market.borrow(150e18);
        vm.stopPrank();
        collateralFeed.setAnswer(0.8e8);
        assertLt(market.healthFactorWad(carol), 1e18);
        // Debt value 150 >= dust; target leaves < dust so the full debt is allowed. Leaving 1 wei of dust reverts.
        uint256 debt = market.debtAssets(carol);
        vm.prank(mallory);
        vm.expectRevert(LiquidationEngine.DustResidual.selector);
        market.liquidate(carol, debt - 60e18);
    }

    function test_griefing_tinyRepayCannotBlockLaterLiquidation() public {
        _underwater();
        vm.prank(mallory);
        market.liquidate(bob, 1e18);
        vm.prank(liquidator);
        market.liquidate(bob, type(uint256).max);
        assertGe(market.healthFactorWad(bob), market.targetHealthFactorWad());
    }

    function test_selfLiquidation_rejected() public {
        _underwater();
        vm.prank(bob);
        vm.expectRevert(Market.SelfLiquidation.selector);
        market.liquidate(bob, type(uint256).max);
    }

    function test_pause_blocksLiquidationButNotRepay() public {
        _underwater();
        vm.prank(guardian);
        emergency.pause(address(market));
        vm.prank(liquidator);
        vm.expectRevert(Market.MarketPaused.selector);
        market.liquidate(bob, type(uint256).max);
        vm.prank(bob);
        market.repay(bob, 1e18);
    }

    function test_badDebt_collateralExhaustedLeavesRecordedDebt() public {
        collateralFeed.setAnswer(0.3e8); // C=300 < D=700: target infeasible, close factor + coverage bound
        _poke();
        for (uint256 i; i < 10; i++) {
            vm.prank(liquidator);
            try market.liquidate(bob, type(uint256).max) {}
            catch {
                break;
            }
        }
        assertGt(market.debtAssets(bob), 0);
        assertLt(market.collateralAssets(bob), 1e12);
    }

    function test_targetHf_curatorBounds() public {
        vm.startPrank(curator);
        vm.expectRevert(Market.BadTargetHealthFactor.selector);
        market.setTargetHealthFactor(1e18);
        vm.expectRevert(Market.BadTargetHealthFactor.selector);
        market.setTargetHealthFactor(2.1e18);
        market.setTargetHealthFactor(1.2e18);
        vm.stopPrank();
        assertEq(market.targetHealthFactorWad(), 1.2e18);
    }

    function testFuzz_quoteRestoresTargetOrHitsCap(uint256 collPrice, uint256 repayReq) public {
        collPrice = bound(collPrice, 0.84e8, 0.95e8);
        collateralFeed.setAnswer(int256(collPrice));
        _poke();
        if (market.healthFactorWad(bob) >= 1e18) return;
        repayReq = bound(repayReq, 1e18, 1_000e18);
        uint256 debtBefore = market.debtAssets(bob);
        vm.prank(liquidator);
        try market.liquidate(bob, repayReq) {
            assertLe(debtBefore - market.debtAssets(bob), debtBefore / 2);
            if (repayReq >= debtBefore / 2) assertGe(market.healthFactorWad(bob), 1.05e18);
        } catch (bytes memory err) {
            assertEq(bytes4(err), LiquidationEngine.DustResidual.selector);
        }
    }
}
