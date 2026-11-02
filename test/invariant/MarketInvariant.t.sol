// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {StdInvariant} from "forge-std/StdInvariant.sol";
import {LiquidityHub} from "../../src/LiquidityHub.sol";
import {PositionManager} from "../../src/PositionManager.sol";
import {PrivacyMode} from "../../src/types/PrivacyMode.sol";
import {Handler} from "./Handler.sol";
import {FeeController} from "../../src/FeeController.sol";
import {ProtocolFixture} from "../utils/ProtocolFixture.sol";

contract MarketInvariantTest is ProtocolFixture {
    Handler internal handler;

    function setUp() public override {
        super.setUp();
        handler = new Handler(
            market,
            hub,
            emergency,
            borrowToken,
            collateralToken,
            borrowFeed,
            collateralFeed,
            governor,
            guardian,
            liquidator,
            alice,
            bob,
            carol
        );
        feeController = new FeeController(market, governor, treasury, curator, 0.2e18);
        vm.prank(governor);
        market.setFeeRecipient(address(feeController));
        handler.setFeeController(feeController);
        bytes4[] memory selectors = new bytes4[](12);
        selectors[0] = handler.supply.selector;
        selectors[1] = handler.withdraw.selector;
        selectors[2] = handler.addCollateral.selector;
        selectors[3] = handler.removeCollateral.selector;
        selectors[4] = handler.borrow.selector;
        selectors[5] = handler.repay.selector;
        selectors[6] = handler.liquidate.selector;
        selectors[7] = handler.warp.selector;
        selectors[8] = handler.pauseRepayUnpause.selector;
        selectors[9] = handler.liquidateMax.selector;
        selectors[10] = handler.staleOracleRepayAddCollateral.selector;
        selectors[11] = handler.distributeFees.selector;
        targetSelector(StdInvariant.FuzzSelector({addr: address(handler), selectors: selectors}));
        targetContract(address(handler));
        excludeContract(address(this));
        excludeContract(address(market));
        excludeContract(address(hub));
        excludeContract(address(oracle));
        excludeContract(address(emergency));
        excludeContract(address(fhe));
        excludeContract(address(risk));
        excludeContract(address(liquidation));
        excludeContract(address(irm));
        excludeContract(address(borrowToken));
        excludeContract(address(collateralToken));
        excludeContract(address(borrowFeed));
        excludeContract(address(collateralFeed));
        excludeContract(address(market.positions()));
        excludeContract(address(feeController));
    }

    FeeController internal feeController;

    /// INVARIANTS.md: fee ledgers never exceed the shares the FeeController holds.
    function invariant_feeLedgersWithinHeldShares() public view {
        assertLe(
            feeController.protocolShares() + feeController.curatorShares(),
            market.supplyShares(address(feeController))
        );
    }

    /// INVARIANTS.md: after a max-request liquidation HF >= target unless a cap bound.
    function invariant_postLiquidationHfAtLeastTargetUnlessCapped() public view {
        assertEq(handler.ghostTargetViolations(), 0);
    }

    /// INVARIANTS.md: repay and addCollateral never read the oracle.
    function invariant_repayAndAddCollateralOracleFree() public view {
        assertEq(handler.ghostOracleFreeFailures(), 0);
    }

    function invariant_supplySharesReconcile() public view {
        uint256 sum = market.supplyShares(alice) + market.supplyShares(bob) + market.supplyShares(carol)
            + market.supplyShares(treasury) + market.supplyShares(address(feeController));
        assertEq(market.pendingFeeShares(), 0);
        assertEq(sum, market.totalSupplyShares());
    }

    function invariant_debtSharesReconcile() public view {
        uint256 sum = market.debtShares(alice) + market.debtShares(bob) + market.debtShares(carol);
        assertEq(sum, market.totalBorrowShares());
    }

    function invariant_collateralReconcilesWithHub() public view {
        uint256 sum = market.collateralAssets(alice) + market.collateralAssets(bob) + market.collateralAssets(carol);
        assertEq(sum, market.totalCollateral());
        assertEq(
            market.totalCollateral(),
            hub.cashOf(address(market), address(collateralToken), LiquidityHub.BucketKind.Collateral)
        );
    }

    function invariant_borrowCashMatchesBucketWhenUndonated() public view {
        assertEq(
            hub.cashOf(address(market), address(borrowToken), LiquidityHub.BucketKind.Liquidity),
            borrowToken.balanceOf(address(hub))
        );
        assertEq(collateralToken.balanceOf(address(hub)), market.totalCollateral());
    }

    function invariant_indexesAtLeastRay() public view {
        assertGe(market.borrowIndex(), 1e27);
        assertGe(market.supplyIndex(), 1e27);
        assertGe(market.borrowIndex(), handler.lastBorrowIndex());
        assertGe(market.supplyIndex(), handler.lastSupplyIndex());
    }

    function invariant_creditLineHolds() public view {
        assertLe(
            hub.principalDrawn(address(market), address(borrowToken)),
            hub.creditLimit(address(market), address(borrowToken))
        );
    }

    function invariant_solvency() public view {
        uint256 cash = hub.cashOf(address(market), address(borrowToken), LiquidityHub.BucketKind.Liquidity);
        assertGe(cash + market.totalDebtAssets(), market.totalSupplyAssets());
    }

    function invariant_publicAndReservedSlotsStayClear() public view {
        assertEq(uint8(market.privacyMode()), uint8(PrivacyMode.Public));
        assertFalse(fhe.encryptionAvailable());
        assertEq(fhe.privacyLabel(), "public-plaintext");
        _assertPosition(alice);
        _assertPosition(bob);
        _assertPosition(carol);
        _assertPosition(treasury);
    }

    function _assertPosition(address user) internal view {
        PositionManager.PositionView memory p = market.positions().viewPosition(user);
        assertEq(p.supplyReserved1, bytes32(0));
        assertEq(p.supplyReserved2, bytes32(0));
        assertEq(p.supplyReserved3, bytes32(0));
        assertEq(p.collateralReserved1, bytes32(0));
        assertEq(p.collateralReserved2, bytes32(0));
        assertEq(p.collateralReserved3, bytes32(0));
        assertEq(p.debtReserved1, bytes32(0));
        assertEq(p.debtReserved2, bytes32(0));
        assertEq(p.debtReserved3, bytes32(0));
        assertEq(p.healthFactorHandle, bytes32(0));
        assertFalse(fhe.isEncrypted(p.supplySharesWord));
        assertFalse(fhe.isEncrypted(p.collateralWord));
        assertFalse(fhe.isEncrypted(p.debtSharesWord));
        if (p.layoutVersion != 0) {
            assertEq(p.layoutVersion, 1);
            assertEq(p.privacyMode, uint8(PrivacyMode.Public));
            assertEq(p.owner, user);
        }
    }

    /// @dev Guards against a vacuous pass: the post-liquidation HF invariant only means something if
    ///      the liquidateMax handler can actually execute a liquidation.
    function test_liquidateMaxHandlerExecutes() public {
        handler.supply(1, 1e21);
        handler.addCollateral(0, 1e21);
        handler.borrow(0, 4e20);
        handler.liquidateMax(0);
        assertEq(handler.ghostFullLiquidations(), 1, "liquidateMax did not liquidate");
        assertEq(handler.ghostTargetViolations(), 0);
    }
}
