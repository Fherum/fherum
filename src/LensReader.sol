// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {EmergencyController} from "./EmergencyController.sol";
import {Market} from "./Market.sol";
import {IEligibilityAdapter} from "./interfaces/IEligibilityAdapter.sol";
import {ReserveAccounting} from "./libraries/ReserveAccounting.sol";

/// @title LensReader
/// @notice View helpers for public market aggregates. No writes, no indexer, no private balances.
/// @dev Totals, caps, and indexes are the market's own views. Utilization and rates are `previewRates`.
///      User supply assets use the stored supply index, the same rounding as `totalSupplyAssets`.
///      User debt assets use `Market.debtAssets`, which previews accrual to this block.
///      `privacyMode` is the market constant. Pause flags come from `EmergencyController`.
contract LensReader {
    struct MarketSnapshot {
        uint256 totalSupplyAssets;
        uint256 totalDebtAssets;
        uint256 totalSupplyShares;
        uint256 totalBorrowShares;
        uint256 totalCollateral;
        uint256 availableLiquidity;
        uint256 utilizationWad;
        uint256 borrowRatePerYearWad;
        uint256 supplyRatePerYearWad;
        uint256 supplyCap;
        uint256 borrowCap;
        uint256 walletSupplyCap;
        uint256 walletBorrowCap;
        uint256 ltvWad;
        uint256 liquidationThresholdWad;
        uint256 liquidationBonusWad;
        uint256 closeFactorWad;
        uint256 reserveFactorWad;
        uint256 dustValueWad;
        uint256 supplyIndex;
        uint256 borrowIndex;
        bool paused;
        bool borrowPaused;
        bool removeCollateralPaused;
        bool liquidationPaused;
        bool repayPaused;
        uint8 privacyMode;
        address eligibility;
    }

    struct UserSnapshot {
        uint256 supplyShares;
        uint256 supplyAssets;
        uint256 collateralAssets;
        uint256 debtShares;
        uint256 debtAssets;
        uint256 healthFactorWad;
        bool eligible;
    }

    function snapshot(Market market) external view returns (MarketSnapshot memory s) {
        s.totalSupplyAssets = market.totalSupplyAssets();
        s.totalDebtAssets = market.totalDebtAssets();
        s.totalSupplyShares = market.totalSupplyShares();
        s.totalBorrowShares = market.totalBorrowShares();
        s.totalCollateral = market.totalCollateral();
        s.availableLiquidity = market.availableLiquidity();
        (s.utilizationWad, s.borrowRatePerYearWad, s.supplyRatePerYearWad) = market.previewRates();
        (s.supplyCap, s.borrowCap, s.walletSupplyCap, s.walletBorrowCap) = market.caps();
        s.ltvWad = market.ltvWad();
        s.liquidationThresholdWad = market.liquidationThresholdWad();
        s.liquidationBonusWad = market.liquidationBonusWad();
        s.closeFactorWad = market.closeFactorWad();
        s.reserveFactorWad = market.reserveFactorWad();
        s.dustValueWad = market.dustValueWad();
        s.supplyIndex = market.supplyIndex();
        s.borrowIndex = market.borrowIndex();

        EmergencyController emergency = market.emergency();
        s.paused = emergency.paused(address(market));
        s.borrowPaused = emergency.borrowPaused(address(market));
        s.removeCollateralPaused = emergency.removeCollateralPaused(address(market));
        s.liquidationPaused = emergency.liquidationPaused(address(market));
        s.repayPaused = emergency.repayPaused(address(market));
        s.privacyMode = uint8(market.privacyMode());
        s.eligibility = address(market.eligibility());
    }

    function userSnapshot(Market market, address user) external view returns (UserSnapshot memory u) {
        u.supplyShares = market.supplyShares(user);
        u.supplyAssets = ReserveAccounting.supplyAssets(u.supplyShares, market.supplyIndex());
        u.collateralAssets = market.collateralAssets(user);
        u.debtShares = market.debtShares(user);
        u.debtAssets = market.debtAssets(user);
        u.healthFactorWad = market.healthFactorWad(user);
        IEligibilityAdapter gate = market.eligibility();
        u.eligible = address(gate) == address(0) || gate.isEligible(address(market), user);
    }
}
