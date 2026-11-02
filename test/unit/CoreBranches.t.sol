// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {TimelockController} from "@openzeppelin/contracts/governance/TimelockController.sol";
import {ProtocolFixture} from "../utils/ProtocolFixture.sol";
import {Market} from "../../src/Market.sol";
import {AllowlistEligibility} from "../../src/AllowlistEligibility.sol";
import {CuratorRegistry} from "../../src/CuratorRegistry.sol";
import {EmergencyController} from "../../src/EmergencyController.sol";
import {FeeController} from "../../src/FeeController.sol";
import {ForgeAdmin} from "../../src/ForgeAdmin.sol";
import {InterestRateModel} from "../../src/InterestRateModel.sol";
import {LiquidationEngine} from "../../src/LiquidationEngine.sol";
import {LiquidityHub} from "../../src/LiquidityHub.sol";
import {MarketFactory} from "../../src/MarketFactory.sol";
import {OracleAdapter} from "../../src/OracleAdapter.sol";
import {PositionManager} from "../../src/PositionManager.sol";
import {RiskEngine} from "../../src/RiskEngine.sol";
import {PlaintextFHEAdapter} from "../../src/PlaintextFHEAdapter.sol";
import {IFHEAdapter} from "../../src/interfaces/IFHEAdapter.sol";
import {MockAggregatorV3} from "../mocks/MockAggregatorV3.sol";
import {MockERC20} from "../mocks/MockERC20.sol";

/// @notice Revert-path / role-check coverage for the non-Market core contracts.
contract CoreBranchesTest is ProtocolFixture {
    // ---------------- constructors ----------------
    function test_ctor_allowlist() public {
        vm.expectRevert(AllowlistEligibility.ZeroAddress.selector);
        new AllowlistEligibility(address(0), curator);
    }

    function test_ctor_emergency() public {
        vm.expectRevert(EmergencyController.ZeroAddress.selector);
        new EmergencyController(governor, address(0));
    }

    function test_ctor_forgeAdminZero() public {
        vm.expectRevert(ForgeAdmin.ZeroAddress.selector);
        new ForgeAdmin(address(0), curator, 1);
    }

    function test_ctor_forgeAdminDelay() public {
        vm.expectRevert(ForgeAdmin.ZeroDelay.selector);
        new ForgeAdmin(governor, curator, 0);
    }

    function test_ctor_hub() public {
        vm.expectRevert(LiquidityHub.ZeroAddress.selector);
        new LiquidityHub(address(0));
    }

    function test_ctor_oracle() public {
        vm.expectRevert(OracleAdapter.ZeroAddress.selector);
        new OracleAdapter(address(0));
    }

    function test_ctor_risk() public {
        vm.expectRevert(RiskEngine.ZeroAddress.selector);
        new RiskEngine(IFHEAdapter(address(0)));
    }

    function test_ctor_positionManager() public {
        vm.expectRevert(PositionManager.ZeroAddress.selector);
        new PositionManager(fhe, address(0));
    }

    function test_ctor_registry() public {
        vm.expectRevert(CuratorRegistry.ZeroAddress.selector);
        new CuratorRegistry(governor, curator, TimelockController(payable(address(0))));
    }

    function test_ctor_factory() public {
        vm.expectRevert(MarketFactory.ZeroAddress.selector);
        new MarketFactory(
            address(0),
            hub,
            TimelockController(payable(address(1))),
            CuratorRegistry(address(1)),
            oracle,
            irm,
            emergency,
            fhe,
            risk,
            liquidation
        );
    }

    function test_ctor_feeControllerZero() public {
        vm.expectRevert(FeeController.ZeroAddress.selector);
        new FeeController(market, governor, address(0), curator, 0);
    }

    function test_ctor_feeControllerShare() public {
        vm.expectRevert(FeeController.BadCuratorShare.selector);
        new FeeController(market, governor, treasury, curator, 0.5e18 + 1);
    }

    function test_feeController_adminBranches() public {
        FeeController fc = new FeeController(market, governor, treasury, curator, 0.2e18);
        vm.startPrank(governor);
        vm.expectRevert(FeeController.BadCuratorShare.selector);
        fc.setCuratorShare(0.5e18 + 1);
        vm.expectRevert(FeeController.ZeroAddress.selector);
        fc.setRecipients(address(0), curator);
        vm.expectRevert(FeeController.ZeroAddress.selector);
        fc.setRecipients(treasury, address(0));
        fc.setRecipients(carol, carol);
        vm.stopPrank();
        vm.expectRevert(FeeController.NothingToClaim.selector);
        fc.claimProtocol(0);
        vm.prank(carol);
        vm.expectRevert();
        fc.setCuratorShare(0);
    }

    // ---------------- eligibility ----------------
    function test_allowlist_branches() public {
        AllowlistEligibility gate = new AllowlistEligibility(governor, curator);
        vm.startPrank(curator);
        vm.expectRevert(AllowlistEligibility.ZeroAddress.selector);
        gate.setAllowed(address(0), alice, true);
        vm.expectRevert(AllowlistEligibility.ZeroAddress.selector);
        gate.setMerkleRoot(address(0), bytes32(0));
        gate.setMerkleRoot(address(market), gate.leaf(address(market), alice)); // single-leaf tree
        vm.stopPrank();
        bytes32[] memory proof = new bytes32[](0);
        vm.expectRevert(AllowlistEligibility.ZeroAddress.selector);
        gate.claim(address(0), proof);
        vm.prank(bob);
        vm.expectRevert(AllowlistEligibility.InvalidProof.selector);
        gate.claim(address(market), proof);
        vm.prank(alice);
        gate.claim(address(market), proof);
        assertTrue(gate.isEligible(address(market), alice));
    }

    // ---------------- emergency ----------------
    function test_emergency_branches() public {
        vm.prank(guardian);
        vm.expectRevert(EmergencyController.ZeroAddress.selector);
        emergency.pause(address(0));
        vm.prank(carol);
        vm.expectRevert(EmergencyController.NotGuardian.selector);
        emergency.pause(address(market));
        vm.prank(governor); // admin may pause too
        emergency.pause(address(market));
        vm.prank(governor);
        vm.expectRevert(EmergencyController.ZeroAddress.selector);
        emergency.unpause(address(0));
        vm.prank(guardian);
        vm.expectRevert();
        emergency.unpause(address(market)); // guardian cannot unpause
        assertFalse(emergency.repayPaused(address(market)));
    }

    // ---------------- hub ----------------
    function test_hub_branches() public {
        vm.startPrank(governor);
        vm.expectRevert(LiquidityHub.ZeroAddress.selector);
        hub.registerSpoke(address(0));
        vm.expectRevert(LiquidityHub.ZeroAddress.selector);
        hub.setAssetAllowed(address(0), true);
        vm.expectRevert(LiquidityHub.ZeroAddress.selector);
        hub.setCreditLimit(address(0), address(borrowToken), 1);
        hub.registerSpoke(address(this));
        hub.setCreditLimit(address(this), address(borrowToken), 10e18);
        vm.stopPrank();
        vm.prank(carol);
        vm.expectRevert(LiquidityHub.NotSpoke.selector);
        hub.withdraw(address(borrowToken), LiquidityHub.BucketKind.Liquidity, carol, 1);

        MockERC20 other = new MockERC20("X", "X", 18);
        vm.expectRevert(abi.encodeWithSelector(LiquidityHub.AssetNotAllowed.selector, address(other)));
        hub.deposit(address(other), LiquidityHub.BucketKind.Liquidity, 1);
        vm.expectRevert(abi.encodeWithSelector(LiquidityHub.AssetNotAllowed.selector, address(other)));
        hub.draw(address(other), address(this), 1);
        vm.expectRevert(LiquidityHub.ZeroAmount.selector);
        hub.withdraw(address(borrowToken), LiquidityHub.BucketKind.Liquidity, address(this), 0);
        vm.expectRevert(LiquidityHub.ZeroAmount.selector);
        hub.draw(address(borrowToken), address(this), 0);
        vm.expectRevert(LiquidityHub.ZeroAmount.selector);
        hub.deposit(address(borrowToken), LiquidityHub.BucketKind.Liquidity, 0);
        vm.expectRevert(LiquidityHub.InsufficientCash.selector);
        hub.withdraw(address(borrowToken), LiquidityHub.BucketKind.Liquidity, address(this), 1);
        vm.expectRevert(LiquidityHub.CreditLineExceeded.selector);
        hub.draw(address(borrowToken), address(this), 11e18);
        vm.expectRevert(LiquidityHub.InsufficientCash.selector);
        hub.draw(address(borrowToken), address(this), 1e18);

        borrowToken.mint(address(this), 5e18);
        borrowToken.approve(address(hub), type(uint256).max);
        hub.deposit(address(borrowToken), LiquidityHub.BucketKind.Liquidity, 5e18);
        vm.expectRevert(LiquidityHub.ZeroAddress.selector);
        hub.withdraw(address(borrowToken), LiquidityHub.BucketKind.Liquidity, address(0), 1);
    }

    // ---------------- registry ----------------
    function test_registry_branches() public {
        address[] memory list = new address[](1);
        list[0] = address(0);
        TimelockController tl = new TimelockController(1 days, list, list, governor);
        CuratorRegistry reg = new CuratorRegistry(governor, curator, tl);
        vm.startPrank(governor);
        reg.grantRole(reg.REGISTRAR_ROLE(), governor);
        vm.expectRevert(CuratorRegistry.ZeroAddress.selector);
        reg.registerMarket(address(0));
        vm.expectRevert(abi.encodeWithSelector(CuratorRegistry.NotAContract.selector, carol));
        reg.registerMarket(carol);
        vm.expectRevert(CuratorRegistry.ZeroAddress.selector);
        reg.queueFeeRecipient(address(market), address(0));
        FeeController fc = new FeeController(market, governor, treasury, curator, 0);
        vm.expectRevert(CuratorRegistry.ZeroAddress.selector);
        reg.queueFeeRecipients(fc, address(0), curator);
        vm.expectRevert(abi.encodeWithSelector(CuratorRegistry.UnknownOperation.selector, bytes32(uint256(1))));
        reg.cancel(bytes32(uint256(1)));
        vm.stopPrank();
        vm.expectRevert(abi.encodeWithSelector(CuratorRegistry.UnknownOperation.selector, bytes32(uint256(1))));
        reg.execute(bytes32(uint256(1)));
        vm.prank(carol);
        vm.expectRevert(abi.encodeWithSelector(CuratorRegistry.NotCanceller.selector, carol));
        reg.cancel(bytes32(uint256(1)));
    }

    // ---------------- factory ----------------
    function test_factory_registerBranches() public {
        address[] memory list = new address[](1);
        list[0] = address(0);
        TimelockController tl = new TimelockController(1 days, list, list, governor);
        CuratorRegistry reg = new CuratorRegistry(governor, curator, tl);
        MarketFactory f =
            new MarketFactory(governor, hub, tl, reg, oracle, irm, emergency, fhe, risk, liquidation);
        vm.startPrank(governor);
        vm.expectRevert(MarketFactory.ZeroAddress.selector);
        f.registerMarket(Market(address(0)), 1);
        // fixture market is governor-controlled, not timelock-controlled
        vm.expectRevert(MarketFactory.NotTimelockControlled.selector);
        f.registerMarket(market, 1);
        MockERC20 other = new MockERC20("X", "X", 18);
        Market unlisted = new Market(_config(address(other), address(borrowToken)));
        vm.expectRevert(abi.encodeWithSelector(MarketFactory.AssetNotListed.selector, address(other)));
        f.registerMarket(unlisted, 1);
        Market unlisted2 = new Market(_config(address(collateralToken), address(other)));
        vm.expectRevert(abi.encodeWithSelector(MarketFactory.AssetNotListed.selector, address(other)));
        f.registerMarket(unlisted2, 1);
        Market.MarketConfig memory c = _config(address(collateralToken), address(borrowToken));
        c.risk = new RiskEngine(fhe);
        Market mismatched = new Market(c);
        vm.expectRevert(MarketFactory.ComponentMismatch.selector);
        f.registerMarket(mismatched, 1);
        vm.stopPrank();
    }

    // ---------------- oracle config ----------------
    function test_oracle_setFeedBranches() public {
        vm.startPrank(governor);
        vm.expectRevert(OracleAdapter.ZeroAddress.selector);
        oracle.setFeed(address(0), address(borrowFeed), 18, 1 hours, 1);
        vm.expectRevert(OracleAdapter.BadFeedConfig.selector);
        oracle.setFeed(address(borrowToken), address(borrowFeed), 18, 0, 1);
        vm.expectRevert(OracleAdapter.BadFeedConfig.selector);
        oracle.setFeed(address(borrowToken), address(borrowFeed), 18, 1 hours, 0);
        MockAggregatorV3 wide = new MockAggregatorV3(19, 1e8);
        vm.expectRevert(abi.encodeWithSelector(OracleAdapter.DecimalsMismatch.selector, address(borrowToken)));
        oracle.setFeed(address(borrowToken), address(wide), 18, 1 hours, 1);
        vm.expectRevert(abi.encodeWithSelector(OracleAdapter.TokenDecimalsMismatch.selector, address(borrowToken)));
        oracle.setFeed(address(borrowToken), address(borrowFeed), 6, 1 hours, 1);
        // asset without decimals(): accepted with the declared decimals
        oracle.setFeed(carol, address(borrowFeed), 6, 1 hours, type(uint256).max);
        vm.stopPrank();
    }

    // ---------------- pure engines ----------------
    function _q() internal pure returns (LiquidationEngine.QuoteInput memory i) {
        i.debtAssets = 100e18;
        i.collateralAssets = 100e18;
        i.repayRequested = 10e18;
        i.debtValueWad = 100e18;
        i.collateralValueWad = 100e18;
        i.bonusWad = 1.05e18;
        i.closeFactorWad = 0.5e18;
        i.dustValueWad = 0;
        i.debtPriceWadPerWhole = 1e18;
        i.collateralPriceWadPerWhole = 1e18;
        i.debtDecimals = 18;
        i.collateralDecimals = 18;
        i.liquidationThresholdWad = 0.85e18;
        i.targetHealthFactorWad = 1.05e18;
    }

    function test_liquidationEngine_branches() public {
        LiquidationEngine.QuoteInput memory i = _q();
        i.bonusWad = 0.99e18;
        vm.expectRevert(LiquidationEngine.BadBonus.selector);
        liquidation.maxRepayAssets(i);
        i = _q();
        i.targetHealthFactorWad = 1e18;
        vm.expectRevert(LiquidationEngine.BadTarget.selector);
        liquidation.maxRepayAssets(i);
        i = _q();
        i.debtAssets = 0;
        vm.expectRevert(LiquidationEngine.NothingToRepay.selector);
        liquidation.maxRepayAssets(i);
        i = _q();
        i.debtAssets = 1;
        i.closeFactorWad = 0.5e18;
        vm.expectRevert(LiquidationEngine.NothingToRepay.selector);
        liquidation.maxRepayAssets(i); // closeCap rounds to 0
        i = _q();
        i.repayRequested = 0;
        vm.expectRevert(LiquidationEngine.NothingToRepay.selector);
        liquidation.quote(i);
        // infeasible target (target <= LT*bonus) => closeFactor cap only
        i = _q();
        i.liquidationThresholdWad = 0.95e18;
        i.bonusWad = 1.15e18;
        i.repayRequested = type(uint128).max;
        assertEq(liquidation.maxRepayAssets(i), 50e18);
        assertEq(liquidation.targetRepayValueWad(100e18, 100e18, 0.95e18, 1.15e18, 1.05e18), type(uint256).max);
        // seize capped at collateral
        i = _q();
        i.collateralAssets = 1e18;
        LiquidationEngine.Quote memory q = liquidation.quote(i);
        assertEq(q.seizeAssets, 1e18);
        assertEq(liquidation.badDebtAfterQuote(_q()) > 0, true);
        // seizeForRepay
        vm.expectRevert(LiquidationEngine.BadBonus.selector);
        liquidation.seizeForRepay(1, 1, 0.5e18, 1e18, 1e18, 18, 18);
        vm.expectRevert(LiquidationEngine.NothingToRepay.selector);
        liquidation.seizeForRepay(0, 1, 1e18, 1e18, 1e18, 18, 18);
        vm.expectRevert(LiquidationEngine.ZeroSeize.selector);
        liquidation.seizeForRepay(1e18, 0, 1e18, 1e18, 1e18, 18, 18);
        (uint256 s,,) = liquidation.seizeForRepay(10e18, 1e18, 1.05e18, 1e18, 1e18, 18, 18);
        assertEq(s, 1e18);
    }

    function test_irm_branches() public view {
        InterestRateModel.RateParams memory p = InterestRateModel.RateParams(0, 0.04e18, 0.75e18, 0.8e18);
        assertEq(irm.borrowRatePerYearWad(p, 2e18), irm.borrowRatePerYearWad(p, 1e18));
        assertEq(irm.supplyRatePerYearWad(1e18, 2e18, 0), 1e18);
    }

    function test_irm_reserveFactorRange() public {
        vm.expectRevert(InterestRateModel.ReserveFactorOutOfRange.selector);
        irm.supplyRatePerYearWad(1e18, 1e18, 1e18 + 1);
    }

    function test_positionManager_onlyMarketAndZero() public {
        PositionManager pm = market.positions();
        vm.expectRevert(PositionManager.OnlyMarket.selector);
        pm.addSupplyShares(alice, 1);
        vm.startPrank(address(market));
        vm.expectRevert(PositionManager.ZeroAmount.selector);
        pm.addSupplyShares(alice, 0);
        vm.expectRevert(PositionManager.ZeroAmount.selector);
        pm.subSupplyShares(alice, 0);
        vm.stopPrank();
    }
}
