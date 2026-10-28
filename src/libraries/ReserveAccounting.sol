// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {FixedPoint} from "./FixedPoint.sol";

/// @notice Share and index accounting for one borrow-asset reserve.
/// @dev Indexes only move up. Debt assets round up (the borrower owes the rounded-up amount).
///      Supply assets round down (the supplier can withdraw the rounded-down amount).
///      Interest is simple per accrual and compounds across accruals because it is folded into the index:
///      `newIndex = oldIndex * (1 + borrowRatePerYear * dt / year)`.
///      `year` is 365 days. Utilization denominator L is total supply assets. U = min(1, debt / supply).
library ReserveAccounting {
    struct Reserve {
        uint256 totalSupplyShares;
        uint256 totalBorrowShares;
        uint256 supplyIndex;
        uint256 borrowIndex;
        uint40 lastAccrual;
    }

    error IndexBelowRay();
    error IndexDecreased();
    error TimestampWentBackwards();
    error AccrualOverflow();

    function debtAssets(uint256 shares, uint256 index) internal pure returns (uint256) {
        if (shares == 0) return 0;
        return Math.mulDiv(shares, index, FixedPoint.RAY, Math.Rounding.Ceil);
    }

    function supplyAssets(uint256 shares, uint256 index) internal pure returns (uint256) {
        if (shares == 0) return 0;
        return Math.mulDiv(shares, index, FixedPoint.RAY, Math.Rounding.Floor);
    }

    /// @dev L = supply assets. When supply is 0 and debt is not, utilization is 100%.
    function utilizationWad(uint256 debt, uint256 supply) internal pure returns (uint256) {
        if (supply == 0) return debt == 0 ? 0 : FixedPoint.WAD;
        if (debt >= supply) return FixedPoint.WAD;
        return Math.mulDiv(debt, FixedPoint.WAD, supply, Math.Rounding.Floor);
    }

    /// @notice Apply linear index accrual in memory.
    /// @dev Fee shares are added to `totalSupplyShares` inside this function. The caller must mint the
    ///      same number of supply shares to the fee recipient. Interest that rounds away from suppliers
    ///      stays as surplus cash and is not credited to any position.
    /// @return interestAssets Debt growth, in borrow-asset units.
    /// @return feeShares Supply shares minted for the reserve factor. Already included in `r.totalSupplyShares`.
    function accrue(Reserve memory r, uint256 borrowRatePerYearWad, uint256 reserveFactorWad, uint256 nowTs)
        internal
        pure
        returns (uint256 interestAssets, uint256 feeShares)
    {
        if (r.supplyIndex < FixedPoint.RAY || r.borrowIndex < FixedPoint.RAY) revert IndexBelowRay();
        if (nowTs < r.lastAccrual) revert TimestampWentBackwards();
        if (nowTs > type(uint40).max) revert AccrualOverflow();
        if (nowTs == r.lastAccrual) return (0, 0);

        uint256 dt = nowTs - r.lastAccrual;
        r.lastAccrual = uint40(nowTs);

        if (r.totalBorrowShares == 0 || borrowRatePerYearWad == 0) return (0, 0);

        uint256 oldBorrowIndex = r.borrowIndex;
        uint256 oldSupplyIndex = r.supplyIndex;
        uint256 factorWad = Math.mulDiv(borrowRatePerYearWad, dt, FixedPoint.SECONDS_PER_YEAR, Math.Rounding.Floor);
        if (factorWad > type(uint256).max / FixedPoint.WAD_RAY_RATIO) revert AccrualOverflow();
        uint256 factorRay = factorWad * FixedPoint.WAD_RAY_RATIO;
        if (factorRay > type(uint256).max - FixedPoint.RAY) revert AccrualOverflow();

        uint256 newBorrowIndex =
            Math.mulDiv(oldBorrowIndex, FixedPoint.RAY + factorRay, FixedPoint.RAY, Math.Rounding.Floor);
        if (newBorrowIndex < oldBorrowIndex) revert IndexDecreased();
        r.borrowIndex = newBorrowIndex;

        uint256 oldDebt = debtAssets(r.totalBorrowShares, oldBorrowIndex);
        uint256 newDebt = debtAssets(r.totalBorrowShares, newBorrowIndex);
        if (newDebt < oldDebt) revert IndexDecreased();
        interestAssets = newDebt - oldDebt;

        if (interestAssets == 0 || r.totalSupplyShares == 0) return (interestAssets, 0);

        uint256 feeAssets = Math.mulDiv(interestAssets, reserveFactorWad, FixedPoint.WAD, Math.Rounding.Floor);
        uint256 toSuppliers = interestAssets - feeAssets;
        if (toSuppliers > 0) {
            r.supplyIndex += Math.mulDiv(toSuppliers, FixedPoint.RAY, r.totalSupplyShares, Math.Rounding.Floor);
        }
        if (r.supplyIndex < oldSupplyIndex) revert IndexDecreased();

        if (feeAssets > 0) {
            feeShares = Math.mulDiv(feeAssets, FixedPoint.RAY, r.supplyIndex, Math.Rounding.Floor);
            r.totalSupplyShares += feeShares;
        }
    }
}
