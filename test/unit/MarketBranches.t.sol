// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";
import {ProtocolFixture} from "../utils/ProtocolFixture.sol";
import {Market} from "../../src/Market.sol";
import {Caps} from "../../src/libraries/Caps.sol";
import {IEligibilityAdapter} from "../../src/interfaces/IEligibilityAdapter.sol";

contract DenyAll is IEligibilityAdapter {
    function isEligible(address, address) external pure returns (bool) {
        return false;
    }
}

/// @notice Branch coverage for Market: every revert path, role check, cap and pause branch.
contract MarketBranchesTest is ProtocolFixture {
    function setUp() public override {
        super.setUp();
        _register(market, 1_000_000e18);
        _fund(alice, market);
        _fund(bob, market);
        _fund(liquidator, market);
        vm.prank(alice);
        market.supply(100_000e18);
    }

    function _borrower(uint256 coll, uint256 debt) internal {
        vm.startPrank(bob);
        market.addCollateral(coll);
        if (debt > 0) market.borrow(debt);
        vm.stopPrank();
    }

    // ---------------- constructor ----------------
    function test_ctor_zeroAddresses() public {
        Market.MarketConfig memory c = _config(address(collateralToken), address(borrowToken));
        c.governor = address(0);
        vm.expectRevert(Market.ZeroAddress.selector);
        new Market(c);
        c = _config(address(collateralToken), address(borrowToken));
        c.feeRecipient = address(0);
        vm.expectRevert(Market.ZeroAddress.selector);
        new Market(c);
        c = _config(address(collateralToken), address(borrowToken));
        c.collateralAsset = address(0);
        vm.expectRevert(Market.ZeroAddress.selector);
        new Market(c);
    }

    function test_ctor_assetsMustDiffer() public {
        vm.expectRevert(Market.AssetsMustDiffer.selector);
        new Market(_config(address(borrowToken), address(borrowToken)));
    }

    function test_ctor_badRiskRejected() public {
        Market.MarketConfig memory c = _config(address(collateralToken), address(borrowToken));
        c.ltvWad = 0.9e18;
        vm.expectRevert(Market.LtvAboveThreshold.selector);
        new Market(c);
    }

    // ---------------- role checks ----------------
    function test_roles_curatorAndAdminOnly() public {
        bytes32 cur = market.CURATOR_ROLE();
        bytes32 adm = market.DEFAULT_ADMIN_ROLE();
        vm.startPrank(carol);
        vm.expectRevert(abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, carol, cur));
        market.setRiskParams(0.5e18, 0.6e18, 1.05e18, 0.5e18, 0.1e18, 1e18);
        vm.expectRevert(abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, carol, cur));
        market.setCaps(1, 1, 1, 1);
        vm.expectRevert(abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, carol, cur));
        market.setRateParams(0, 0.04e18, 0.75e18, 0.8e18);
        vm.expectRevert(abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, carol, cur));
        market.setTargetHealthFactor(1.1e18);
        vm.expectRevert(abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, carol, adm));
        market.setFeeRecipient(carol);
        vm.expectRevert(abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, carol, adm));
        market.setEligibility(IEligibilityAdapter(address(0)));
        vm.stopPrank();
        // curator (not admin) cannot touch admin setters
        vm.prank(curator);
        vm.expectRevert(abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, curator, adm));
        market.setFeeRecipient(curator);
    }

    function test_admin_setters() public {
        vm.startPrank(governor);
        vm.expectRevert(Market.ZeroAddress.selector);
        market.setFeeRecipient(address(0));
        market.setFeeRecipient(carol);
        assertEq(market.feeRecipient(), carol);
        DenyAll gate = new DenyAll();
        market.setEligibility(gate);
        vm.stopPrank();
        vm.prank(bob);
        vm.expectRevert(Market.NotEligible.selector);
        market.supply(1e18);
        vm.prank(governor);
        market.setEligibility(IEligibilityAdapter(address(0)));
        vm.prank(bob);
        market.supply(1e18);
    }

    // ---------------- risk param bounds ----------------
    function test_setRisk_allBounds() public {
        vm.startPrank(curator);
        vm.expectRevert(Market.LtvAboveThreshold.selector);
        market.setRiskParams(0.9e18, 0.8e18, 1.05e18, 0.5e18, 0.1e18, 1e18);
        vm.expectRevert(Market.BadLiquidationThreshold.selector);
        market.setRiskParams(0, 0, 1.05e18, 0.5e18, 0.1e18, 1e18);
        vm.expectRevert(Market.BadLiquidationThreshold.selector);
        market.setRiskParams(0.5e18, 0.96e18, 1.05e18, 0.5e18, 0.1e18, 1e18);
        vm.expectRevert(Market.BadBonus.selector);
        market.setRiskParams(0.5e18, 0.8e18, 0.99e18, 0.5e18, 0.1e18, 1e18);
        vm.expectRevert(Market.BadBonus.selector);
        market.setRiskParams(0.5e18, 0.8e18, 1.16e18, 0.5e18, 0.1e18, 1e18);
        vm.expectRevert(Market.BadCloseFactor.selector);
        market.setRiskParams(0.5e18, 0.8e18, 1.05e18, 0.009e18, 0.1e18, 1e18);
        vm.expectRevert(Market.BadCloseFactor.selector);
        market.setRiskParams(0.5e18, 0.8e18, 1.05e18, 1e18 + 1, 0.1e18, 1e18);
        vm.expectRevert(Market.BadReserveFactor.selector);
        market.setRiskParams(0.5e18, 0.8e18, 1.05e18, 0.5e18, 0.5e18 + 1, 1e18);
        vm.expectRevert(Market.BadDust.selector);
        market.setRiskParams(0.5e18, 0.8e18, 1.05e18, 0.5e18, 0.1e18, 1000e18 + 1);
        market.setRiskParams(0.5e18, 0.8e18, 1.05e18, 1e18, 0.5e18, 1000e18);
        assertEq(market.closeFactorWad(), 1e18);
        vm.expectRevert(Market.BadTargetHealthFactor.selector);
        market.setTargetHealthFactor(1.01e18 - 1);
        vm.expectRevert(Market.BadTargetHealthFactor.selector);
        market.setTargetHealthFactor(2e18 + 1);
        market.setTargetHealthFactor(2e18);
        market.setCaps(1e18, 1e18, 1e18, 1e18);
        market.setRateParams(0, 0.04e18, 0.75e18, 0.8e18);
        vm.stopPrank();
    }

    // ---------------- zero amounts / basic reverts ----------------
    function test_zeroAmounts() public {
        vm.startPrank(bob);
        vm.expectRevert(Market.ZeroAmount.selector);
        market.supply(0);
        vm.expectRevert(Market.ZeroAmount.selector);
        market.withdraw(0);
        vm.expectRevert(Market.ZeroAmount.selector);
        market.addCollateral(0);
        vm.expectRevert(Market.ZeroAmount.selector);
        market.removeCollateral(0);
        vm.expectRevert(Market.ZeroAmount.selector);
        market.borrow(0);
        vm.expectRevert(Market.ZeroAddress.selector);
        market.repay(address(0), 1);
        vm.expectRevert(Market.NoDebt.selector);
        market.repay(bob, 1);
        vm.expectRevert(Market.ZeroAddress.selector);
        market.liquidate(address(0), 1);
        vm.expectRevert(Market.SelfLiquidation.selector);
        market.liquidate(bob, 1);
        vm.stopPrank();
    }

    function test_withdraw_branches() public {
        vm.prank(bob);
        vm.expectRevert(Market.InsufficientLiquidity.selector);
        market.withdraw(1e18); // no position
        vm.prank(alice);
        vm.expectRevert(Market.InsufficientLiquidity.selector);
        market.withdraw(100_001e18); // more than own
        _borrower(100_000e18, 60_000e18);
        vm.prank(alice);
        vm.expectRevert(Market.InsufficientLiquidity.selector);
        market.withdraw(50_000e18); // more than available cash
        vm.prank(alice);
        market.withdraw(40_000e18);
    }

    function test_removeCollateral_branches() public {
        _borrower(1_000e18, 700e18);
        vm.startPrank(bob);
        vm.expectRevert(Market.InsufficientLiquidity.selector);
        market.removeCollateral(1_001e18);
        vm.expectRevert(Market.Unhealthy.selector);
        market.removeCollateral(500e18);
        market.removeCollateral(10e18);
        vm.stopPrank();
    }

    function test_borrow_branches() public {
        _borrower(1_000e18, 0);
        vm.startPrank(bob);
        vm.expectRevert(Market.LtvExceeded.selector);
        market.borrow(751e18);
        vm.expectRevert(Market.InsufficientLiquidity.selector);
        market.borrow(100_001e18);
        vm.stopPrank();
        vm.prank(carol);
        vm.expectRevert(Market.LtvExceeded.selector);
        market.borrow(1e18); // no collateral
    }

    // ---------------- caps ----------------
    function test_caps_allFour() public {
        vm.prank(curator);
        market.setCaps(150_000e18, 1_000e18, 120_000e18, 500e18);
        vm.prank(bob);
        vm.expectRevert(Caps.SupplyCapExceeded.selector);
        market.supply(60_000e18);
        vm.prank(alice);
        vm.expectRevert(Caps.WalletSupplyCapExceeded.selector);
        market.supply(30_000e18);
        _borrower(10_000e18, 500e18);
        vm.prank(bob);
        vm.expectRevert(Caps.WalletBorrowCapExceeded.selector);
        market.borrow(1e18);
        vm.startPrank(liquidator);
        market.addCollateral(10_000e18);
        market.borrow(500e18);
        vm.expectRevert(Caps.BorrowCapExceeded.selector);
        market.borrow(1e18);
        vm.stopPrank();
    }

    // ---------------- pause ----------------
    function test_pause_blocksRiskOpsButNotRepaySupplyWithdraw() public {
        _borrower(1_000e18, 500e18);
        vm.prank(guardian);
        emergency.pause(address(market));
        vm.startPrank(bob);
        vm.expectRevert(Market.MarketPaused.selector);
        market.borrow(1e18);
        vm.expectRevert(Market.MarketPaused.selector);
        market.removeCollateral(1e18);
        market.repay(bob, 100e18);
        market.addCollateral(1e18);
        vm.stopPrank();
        vm.prank(liquidator);
        vm.expectRevert(Market.MarketPaused.selector);
        market.liquidate(bob, 1e18);
        vm.prank(alice);
        market.withdraw(1e18);
        vm.prank(alice);
        market.supply(1e18);
        vm.prank(governor);
        emergency.unpause(address(market));
        vm.prank(bob);
        market.borrow(1e18);
    }

    // ---------------- repay ----------------
    function test_repay_fullAndOverpayAndThirdParty() public {
        _borrower(1_000e18, 500e18);
        vm.prank(liquidator);
        market.repay(bob, 100e18);
        vm.prank(bob);
        market.repay(bob, type(uint128).max); // overpay is capped to owed
        assertEq(market.debtShares(bob), 0);
        vm.prank(bob);
        vm.expectRevert(Market.NoDebt.selector);
        market.repay(bob, 1);
    }

    // ---------------- liquidation ----------------
    function test_liquidate_notLiquidatableWhenHealthy() public {
        _borrower(1_000e18, 700e18);
        vm.prank(liquidator);
        vm.expectRevert(Market.NotLiquidatable.selector);
        market.liquidate(bob, 100e18);
        vm.prank(liquidator);
        vm.expectRevert(Market.NotLiquidatable.selector);
        market.liquidate(carol, 100e18); // no debt
    }

    function test_liquidate_partialThenOracleFailClosed() public {
        _borrower(1_000e18, 700e18);
        collateralFeed.setAnswer(0.8e8); // HF = 800*0.85/700 < 1
        vm.prank(liquidator);
        market.liquidate(bob, 100e18);
        vm.warp(block.timestamp + 2 hours); // stale oracle -> fail closed
        vm.prank(liquidator);
        vm.expectRevert();
        market.liquidate(bob, 10e18);
        // repay never reads the oracle
        vm.prank(bob);
        market.repay(bob, 10e18);
        vm.prank(bob);
        market.addCollateral(1e18);
    }

    // ---------------- views / accrual ----------------
    function test_views_andAccrue() public {
        _borrower(1_000e18, 500e18);
        vm.warp(block.timestamp + 30 days);
        _poke();
        (uint256 u, uint256 br, uint256 sr) = market.previewRates();
        assertGt(u, 0);
        assertGt(br, sr);
        uint256 before = market.debtAssets(bob);
        market.accrue();
        assertEq(market.debtAssets(bob), before);
        assertGt(market.totalDebtAssets(), 500e18);
        assertGt(market.totalSupplyAssets(), 100_000e18);
        assertGt(market.supplyIndex(), 1e27);
        assertGt(market.borrowIndex(), 1e27);
        assertGt(market.totalSupplyShares(), 0);
        assertGt(market.totalBorrowShares(), 0);
        assertGt(market.availableLiquidity(), 0);
        assertGt(market.healthFactorWad(bob), 1e18);
        assertGt(market.supplyShares(treasury), 0); // reserve fee flushed to feeRecipient
        assertEq(uint8(market.privacyMode()), 0);
        market.accrue(); // same block: no-op branch
    }
}
