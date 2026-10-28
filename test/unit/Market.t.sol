// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {LiquidityHub} from "../../src/LiquidityHub.sol";
import {Market} from "../../src/Market.sol";
import {PositionManager} from "../../src/PositionManager.sol";
import {PrivacyMode} from "../../src/types/PrivacyMode.sol";
import {Math512} from "../../src/libraries/Math512.sol";
import {MockAggregatorV3} from "../mocks/MockAggregatorV3.sol";
import {MockERC20} from "../mocks/MockERC20.sol";
import {ProtocolFixture} from "../utils/ProtocolFixture.sol";

contract MarketTest is ProtocolFixture {
    function test_supplyBorrowRepayWithdrawRoundTrip() public {
        vm.startPrank(alice);
        market.supply(1_000e18);
        market.addCollateral(1_000e18);
        market.borrow(500e18);
        vm.stopPrank();

        assertEq(market.supplyShares(alice), 1_000e18);
        assertEq(market.debtShares(alice), 500e18);
        assertEq(market.collateralAssets(alice), 1_000e18);
        assertEq(market.healthFactorWad(alice), 1.7e18);
        assertEq(borrowToken.balanceOf(address(hub)), 500e18);
        assertEq(collateralToken.balanceOf(address(hub)), 1_000e18);

        vm.prank(bob);
        market.repay(alice, type(uint256).max);
        assertEq(market.debtShares(alice), 0);

        vm.startPrank(alice);
        market.removeCollateral(1_000e18);
        market.withdraw(1_000e18);
        vm.stopPrank();
        assertEq(market.supplyShares(alice), 0);
        assertEq(market.totalCollateral(), 0);
        assertEq(borrowToken.balanceOf(address(hub)), 0);
    }

    function test_borrowBeyondLtvOrLiquidityOrCapReverts() public {
        vm.prank(alice);
        market.supply(100e18);
        vm.prank(bob);
        market.addCollateral(100e18);

        vm.prank(bob);
        vm.expectRevert(Market.LtvExceeded.selector);
        market.borrow(76e18);

        vm.prank(bob);
        market.borrow(75e18);
        assertGe(market.healthFactorWad(bob), 1e18);

        vm.prank(carol);
        market.addCollateral(1_000e18);
        vm.prank(carol);
        vm.expectRevert(Market.InsufficientLiquidity.selector);
        market.borrow(50e18);

        vm.prank(curator);
        market.setCaps(1_000_000e18, 800_000e18, 500_000e18, 10e18);
        vm.prank(alice);
        market.supply(1_000e18);
        vm.prank(carol);
        vm.expectRevert(abi.encodeWithSignature("WalletBorrowCapExceeded()"));
        market.borrow(11e18);
    }

    function test_removeCollateralStopsAtHealthFactorOne() public {
        vm.prank(curator);
        market.setRiskParams(0.5e18, 0.8e18, 1.05e18, 0.5e18, 0.1e18, 100e18);

        vm.startPrank(alice);
        market.supply(2_000e18);
        market.addCollateral(1_000e18);
        market.borrow(500e18);
        market.removeCollateral(375e18);
        vm.stopPrank();

        assertEq(market.collateralAssets(alice), 625e18);
        assertEq(market.healthFactorWad(alice), 1e18);

        vm.prank(alice);
        vm.expectRevert(Market.Unhealthy.selector);
        market.removeCollateral(1);
    }

    function test_indexesAndSharesAfterOneYear() public {
        vm.startPrank(alice);
        market.supply(1_000e18);
        market.addCollateral(1_000e18);
        market.borrow(500e18);
        vm.stopPrank();

        vm.warp(block.timestamp + 365 days);
        market.accrue();

        assertEq(market.borrowIndex(), 1.025e27);
        assertEq(market.supplyIndex(), 1.01125e27);
        assertGe(market.borrowIndex(), 1e27);
        assertGe(market.supplyIndex(), 1e27);

        uint256 feeShares = 1_236_093_943_139_678_615;
        assertEq(market.supplyShares(treasury), feeShares);
        assertEq(market.supplyShares(alice), 1_000e18);
        assertEq(market.totalSupplyShares(), 1_000e18 + feeShares);
        assertEq(market.totalBorrowShares(), 500e18);
        assertEq(market.debtAssets(alice), 512.5e18);

        uint256 cash = hub.cashOf(address(market), address(borrowToken), LiquidityHub.BucketKind.Liquidity);
        assertGe(cash + market.totalDebtAssets(), market.totalSupplyAssets());
    }

    function test_previewRatesAtHalfUtilization() public {
        vm.startPrank(alice);
        market.supply(1_000e18);
        market.addCollateral(1_000e18);
        market.borrow(500e18);
        vm.stopPrank();
        (uint256 util, uint256 borrowRate, uint256 supplyRate) = market.previewRates();
        assertEq(util, 0.5e18);
        assertEq(borrowRate, 0.025e18);
        assertEq(supplyRate, 0.01125e18);
    }

    function test_pauseBlocksRiskAndAllowsRepay() public {
        vm.startPrank(alice);
        market.supply(1_000e18);
        market.addCollateral(1_000e18);
        market.borrow(100e18);
        vm.stopPrank();

        vm.prank(guardian);
        emergency.pause(address(market));

        vm.prank(alice);
        vm.expectRevert(Market.MarketPaused.selector);
        market.borrow(1e18);

        vm.prank(alice);
        vm.expectRevert(Market.MarketPaused.selector);
        market.removeCollateral(1e18);

        vm.prank(alice);
        vm.expectRevert(Market.MarketPaused.selector);
        market.liquidate(bob, 1e18);

        uint256 debtBefore = market.debtShares(alice);
        vm.prank(alice);
        market.repay(alice, 10e18);
        assertLt(market.debtShares(alice), debtBefore);

        vm.prank(alice);
        market.supply(1e18);
        vm.prank(alice);
        market.withdraw(1e18);

        vm.prank(guardian);
        vm.expectRevert();
        emergency.unpause(address(market));

        vm.prank(governor);
        emergency.unpause(address(market));
        vm.prank(alice);
        market.repay(alice, type(uint256).max);
    }

    function test_staleOracleBlocksBorrowAndLiquidationButNotRepay() public {
        vm.startPrank(alice);
        market.supply(1_000e18);
        market.addCollateral(1_000e18);
        market.borrow(100e18);
        vm.stopPrank();

        borrowFeed.setUpdatedAt(block.timestamp - 2 hours);
        vm.prank(alice);
        vm.expectRevert();
        market.borrow(1e18);
        vm.prank(liquidator);
        vm.expectRevert();
        market.liquidate(alice, 1e18);

        vm.prank(alice);
        market.repay(alice, 1e18);
        assertEq(market.debtAssets(alice), 99e18);
    }

    function test_liquidationPaysOnlyTheBonus() public {
        vm.startPrank(alice);
        market.supply(10_000e18);
        vm.stopPrank();
        vm.startPrank(bob);
        market.addCollateral(1_000e18);
        market.borrow(700e18);
        vm.stopPrank();

        vm.prank(liquidator);
        vm.expectRevert(Market.NotLiquidatable.selector);
        market.liquidate(bob, 100e18);

        collateralFeed.setAnswer(0.6e8);
        uint256 before = collateralToken.balanceOf(liquidator);
        vm.prank(liquidator);
        market.liquidate(bob, 100e18);
        uint256 seized = collateralToken.balanceOf(liquidator) - before;
        assertEq(seized, 175e18);
        assertEq(market.debtAssets(bob), 600e18);

        uint256 repayValue = 100e18;
        uint256 seizeValue = 105e18;
        assertTrue(Math512.mulGte(repayValue, market.liquidationBonusWad(), seizeValue, 1e18));
        assertEq(seizeValue * 1e18, repayValue * market.liquidationBonusWad());
    }

    function test_interestMakesPositionLiquidatable() public {
        vm.prank(curator);
        market.setRiskParams(0.8e18, 0.85e18, 1.05e18, 1e18, 0.1e18, 100e18);
        vm.prank(curator);
        market.setRateParams(1e18, 0.04e18, 0.75e18, 0.8e18);

        vm.prank(alice);
        market.supply(10_000e18);
        vm.startPrank(bob);
        market.addCollateral(1_000e18);
        market.borrow(800e18);
        vm.stopPrank();

        vm.warp(block.timestamp + 30 days);
        _poke();
        assertLt(market.healthFactorWad(bob), 1e18);

        vm.prank(bob);
        vm.expectRevert(Market.SelfLiquidation.selector);
        market.liquidate(bob, 100e18);

        vm.prank(liquidator);
        market.liquidate(bob, 100e18);
        assertLt(market.debtAssets(bob), 800e18);
        assertLt(market.collateralAssets(bob), 1_000e18);
    }

    function test_creditLineAndSpokeIsolation() public {
        vm.prank(governor);
        hub.setCreditLimit(address(market), address(borrowToken), 100e18);
        vm.prank(alice);
        market.supply(1_000e18);
        vm.prank(bob);
        market.addCollateral(1_000e18);
        vm.prank(bob);
        vm.expectRevert(LiquidityHub.CreditLineExceeded.selector);
        market.borrow(101e18);
        vm.prank(bob);
        market.borrow(100e18);

        Market other = _newMarket(address(collateralToken), address(borrowToken));
        _register(other, 800_000e18);
        vm.prank(alice);
        borrowToken.approve(address(other), type(uint256).max);
        vm.prank(alice);
        vm.expectRevert(Market.InsufficientLiquidity.selector);
        other.borrow(1e18);
        assertEq(hub.cashOf(address(other), address(borrowToken), LiquidityHub.BucketKind.Liquidity), 0);
        assertGt(hub.cashOf(address(market), address(borrowToken), LiquidityHub.BucketKind.Liquidity), 0);

        vm.prank(alice);
        vm.expectRevert(LiquidityHub.NotSpoke.selector);
        hub.draw(address(borrowToken), alice, 1);
    }

    function test_sixDecimalCollateralQuotesCorrectly() public {
        MockERC20 coll6 = new MockERC20("Six", "SIX", 6);
        MockAggregatorV3 feed6 = new MockAggregatorV3(8, 1e8);
        _listAsset(address(coll6), address(feed6), 6);
        Market six = _newMarket(address(coll6), address(borrowToken));
        _register(six, 800_000e18);
        coll6.mint(bob, 1_000e6);
        vm.startPrank(bob);
        coll6.approve(address(six), type(uint256).max);
        borrowToken.approve(address(six), type(uint256).max);
        six.addCollateral(1_000e6);
        vm.stopPrank();
        vm.prank(alice);
        borrowToken.approve(address(six), type(uint256).max);
        vm.prank(alice);
        six.supply(1_000e18);
        vm.prank(bob);
        six.borrow(400e18);
        assertEq(six.healthFactorWad(bob), 2.125e18);
    }

    function test_rolesAndHardBounds() public {
        vm.prank(alice);
        vm.expectRevert();
        market.setRiskParams(0.5e18, 0.8e18, 1.05e18, 0.5e18, 0.1e18, 0);

        vm.prank(curator);
        vm.expectRevert(Market.LtvAboveThreshold.selector);
        market.setRiskParams(0.9e18, 0.8e18, 1.05e18, 0.5e18, 0.1e18, 0);

        vm.prank(curator);
        vm.expectRevert(Market.BadLiquidationThreshold.selector);
        market.setRiskParams(0.5e18, 0.96e18, 1.05e18, 0.5e18, 0.1e18, 0);

        vm.prank(curator);
        vm.expectRevert(Market.BadBonus.selector);
        market.setRiskParams(0.5e18, 0.8e18, 1.2e18, 0.5e18, 0.1e18, 0);

        vm.prank(curator);
        vm.expectRevert();
        oracle.setFeed(address(borrowToken), address(borrowFeed), 18, 1 hours, 1e8);

        vm.prank(guardian);
        vm.expectRevert(LiquidityHub.NotSpoke.selector);
        hub.withdraw(address(borrowToken), LiquidityHub.BucketKind.Liquidity, guardian, 1);
    }

    function test_privacyModeAndReservedSlots() public {
        assertEq(uint8(market.privacyMode()), uint8(PrivacyMode.Public));
        assertFalse(fhe.encryptionAvailable());

        vm.prank(alice);
        market.supply(25e18);
        vm.prank(alice);
        market.addCollateral(7e18);

        PositionManager positions = market.positions();
        PositionManager.PositionView memory view_ = positions.viewPosition(alice);
        assertEq(view_.owner, alice);
        assertEq(view_.privacyMode, uint8(PrivacyMode.Public));
        assertEq(view_.layoutVersion, 1);
        assertEq(view_.supplyReserved1, bytes32(0));
        assertEq(view_.supplyReserved2, bytes32(0));
        assertEq(view_.supplyReserved3, bytes32(0));
        assertEq(view_.collateralReserved1, bytes32(0));
        assertEq(view_.debtReserved1, bytes32(0));
        assertEq(view_.debtReserved2, bytes32(0));
        assertEq(view_.debtReserved3, bytes32(0));
        assertEq(view_.healthFactorHandle, bytes32(0));
        assertFalse(fhe.isEncrypted(view_.supplySharesWord));
        assertFalse(fhe.isEncrypted(view_.collateralWord));
        assertEq(fhe.decrypt(view_.supplySharesWord), 25e18);
        assertEq(fhe.decrypt(view_.collateralWord), 7e18);

        uint256 base = uint256(keccak256(abi.encode(alice, positions.POSITIONS_MAPPING_SLOT())));
        bytes32 slot0 = vm.load(address(positions), bytes32(base));
        assertEq(address(uint160(uint256(slot0))), alice);
        assertEq(uint8(uint256(slot0) >> 160), 1);
        assertEq(uint8(uint256(slot0) >> (21 * 8)), uint8(PrivacyMode.Public));
        assertEq(vm.load(address(positions), bytes32(base + 2)), bytes32(0));
        assertEq(vm.load(address(positions), bytes32(base + 13)), bytes32(0));
        assertEq(uint256(vm.load(address(positions), bytes32(base + 14))), 1);
    }

    function test_directDonationDoesNotIncreaseSupply() public {
        vm.prank(alice);
        market.supply(100e18);
        uint256 beforeShares = market.totalSupplyShares();
        borrowToken.mint(address(hub), 50e18);
        assertEq(market.totalSupplyShares(), beforeShares);
        assertEq(market.totalSupplyAssets(), 100e18);
        assertGt(
            borrowToken.balanceOf(address(hub)),
            hub.cashOf(address(market), address(borrowToken), LiquidityHub.BucketKind.Liquidity)
        );
    }

    function test_sameAssetMarketReverts() public {
        Market.MarketConfig memory cfg = _config(address(borrowToken), address(borrowToken));
        vm.expectRevert(Market.AssetsMustDiffer.selector);
        new Market(cfg);
    }

    function test_noBorrowersMeansIndexStays() public {
        vm.prank(alice);
        market.supply(10e18);
        uint256 index = market.borrowIndex();
        vm.warp(block.timestamp + 10 days);
        market.accrue();
        assertEq(market.borrowIndex(), index);
        assertEq(market.supplyIndex(), index);
    }

    function testFuzz_borrowNeverOpensBelowHealthFactorOne(uint96 collateralAmount, uint96 borrowAmount) public {
        collateralAmount = uint96(bound(collateralAmount, 1e18, 10_000e18));
        borrowAmount = uint96(bound(borrowAmount, 1, 20_000e18));
        vm.prank(alice);
        market.supply(100_000e18);
        vm.prank(bob);
        market.addCollateral(collateralAmount);
        vm.prank(bob);
        try market.borrow(borrowAmount) {
            assertGe(market.healthFactorWad(bob), 1e18);
            uint256 debt = market.debtAssets(bob);
            assertTrue(Math512.mulGte(uint256(collateralAmount), market.ltvWad(), debt, 1e18));
        } catch {}
    }

    function testFuzz_removeCollateralKeepsHealthFactor(uint96 removeAmount) public {
        vm.prank(alice);
        market.supply(10_000e18);
        vm.startPrank(bob);
        market.addCollateral(1_000e18);
        market.borrow(400e18);
        uint256 coll = market.collateralAssets(bob);
        removeAmount = uint96(bound(removeAmount, 1, coll));
        try market.removeCollateral(removeAmount) {
            assertGe(market.healthFactorWad(bob), 1e18);
        } catch {}
        vm.stopPrank();
    }
}
