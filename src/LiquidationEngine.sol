// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {FixedPoint} from "./libraries/FixedPoint.sol";
import {Math512} from "./libraries/Math512.sol";
import {ValueMath} from "./libraries/ValueMath.sol";

/// @title LiquidationEngine
/// @notice Pure seize/repay sizing for a single-collateral, single-debt position.
/// @dev Repay sizing targets a Health Factor (brief 6.10). In WAD quote values:
///        a   = ceil(HF_T * D / WAD)            target-weighted debt
///        c   = floor(LT * C / WAD)             threshold-weighted collateral
///        den = HF_T - ceil(LT * b / WAD)       must be > 0
///        x   = ceil((a - c) * WAD / den)       repay value that restores HF_T
///      x is converted to debt assets rounding up. Every rounding step makes x larger, so the post-liquidation
///      HF is at or above HF_T before the close cap is applied (protocol-favourable).
///      Upper bounds, in order: close factor (`closeFactorWad * debt`), collateral coverage (`C / b`), and
///      the liquidator's request. When `den <= 0` seizing collateral cannot raise HF, so the target is
///      infeasible and the close factor alone bounds the repay (documented fallback, docs/DECISIONS.md).
///      Dust: when debt value is below `dustValueWad`, or the residual debt after the target repay would be
///      below it, the full debt may be closed and the close factor does not apply. A partial repay that would
///      leave a non-zero residual debt value below dust, while a larger repay was allowed, reverts
///      `DustResidual` (anti-griefing). A residual forced by insufficient collateral is bad debt and is allowed.
///      Bonus is a WAD multiplier (1.05e18 means the liquidator may receive collateral worth 105% of
///      the repaid debt value). Seize value is rounded down and then checked:
///      `seizeValue * WAD <= repayValue * bonus`.
///      Dutch bonuses and bad-debt socialization are out of scope (fixed bonus within Market hard bounds). `socializesBadDebt` is false.
///      `badDebtAfterQuote` reports debt assets that remain after the largest seize this quote allows.
///      The engine does not move tokens and does not read oracles.
contract LiquidationEngine {
    struct QuoteInput {
        uint256 debtAssets;
        uint256 collateralAssets;
        uint256 repayRequested;
        uint256 debtValueWad;
        uint256 collateralValueWad;
        uint256 bonusWad;
        uint256 closeFactorWad;
        uint256 dustValueWad;
        uint256 debtPriceWadPerWhole;
        uint256 collateralPriceWadPerWhole;
        uint8 debtDecimals;
        uint8 collateralDecimals;
        uint256 liquidationThresholdWad;
        uint256 targetHealthFactorWad;
    }

    struct Quote {
        uint256 repayAssets;
        uint256 seizeAssets;
        uint256 repayValueWad;
        uint256 seizeValueWad;
    }

    error NothingToRepay();
    error ZeroSeize();
    error BonusExceeded();
    error BadBonus();
    error BadTarget();
    error DustResidual();

    /// @notice This engine never writes off residual debt.
    function socializesBadDebt() external pure returns (bool) {
        return false;
    }

    /// @notice Debt assets still owed after the largest successful quote.
    /// @dev A non-zero result is bad debt left on the borrower. Callers must not treat it as forgiven.
    function badDebtAfterQuote(QuoteInput memory input) public pure returns (uint256) {
        Quote memory q = quote(input);
        return input.debtAssets - q.repayAssets;
    }

    /// @notice Repay value (WAD) that brings HF to `targetHf`. Returns `type(uint256).max` when infeasible
    ///         (`targetHf <= LT * bonus`) and 0 when the position already meets the target.
    function targetRepayValueWad(
        uint256 collateralValueWad,
        uint256 debtValueWad,
        uint256 liquidationThresholdWad,
        uint256 bonusWad,
        uint256 targetHf
    ) public pure returns (uint256) {
        uint256 a = Math.mulDiv(targetHf, debtValueWad, FixedPoint.WAD, Math.Rounding.Ceil);
        uint256 c = Math.mulDiv(liquidationThresholdWad, collateralValueWad, FixedPoint.WAD, Math.Rounding.Floor);
        if (a <= c) return 0;
        uint256 ltb = Math.mulDiv(liquidationThresholdWad, bonusWad, FixedPoint.WAD, Math.Rounding.Ceil);
        if (targetHf <= ltb) return type(uint256).max;
        return Math.mulDiv(a - c, FixedPoint.WAD, targetHf - ltb, Math.Rounding.Ceil);
    }

    /// @notice Largest repay (debt assets) allowed before the liquidator's request is applied.
    function maxRepayAssets(QuoteInput memory input) public pure returns (uint256 maxRepay) {
        if (input.bonusWad < FixedPoint.WAD) revert BadBonus();
        if (input.targetHealthFactorWad <= FixedPoint.WAD) revert BadTarget();
        if (input.debtAssets == 0) revert NothingToRepay();

        maxRepay = input.debtAssets;
        if (input.debtValueWad >= input.dustValueWad) {
            uint256 targetValue = targetRepayValueWad(
                input.collateralValueWad,
                input.debtValueWad,
                input.liquidationThresholdWad,
                input.bonusWad,
                input.targetHealthFactorWad
            );
            bool residualIsDust =
                targetValue < input.debtValueWad && input.debtValueWad - targetValue < input.dustValueWad;
            if (!residualIsDust) {
                uint256 closeCap =
                    Math.mulDiv(input.debtAssets, input.closeFactorWad, FixedPoint.WAD, Math.Rounding.Floor);
                if (closeCap == 0) revert NothingToRepay();
                if (closeCap < maxRepay) maxRepay = closeCap;
                if (targetValue != type(uint256).max) {
                    uint256 targetAssets = ValueMath.tokensFromValueWad(
                        targetValue, input.debtPriceWadPerWhole, input.debtDecimals, Math.Rounding.Ceil
                    );
                    if (targetAssets < maxRepay) maxRepay = targetAssets;
                }
            }
        }

        uint256 coverValue = Math.mulDiv(input.collateralValueWad, FixedPoint.WAD, input.bonusWad, Math.Rounding.Floor);
        uint256 coverAssets = ValueMath.tokensFromValueWad(
            coverValue, input.debtPriceWadPerWhole, input.debtDecimals, Math.Rounding.Floor
        );
        if (coverAssets < maxRepay) maxRepay = coverAssets;
    }

    function quote(QuoteInput memory input) public pure returns (Quote memory q) {
        if (input.repayRequested == 0) revert NothingToRepay();
        uint256 maxRepay = maxRepayAssets(input);
        if (maxRepay == 0) revert NothingToRepay();
        uint256 repay = input.repayRequested < maxRepay ? input.repayRequested : maxRepay;

        if (repay < maxRepay && repay < input.debtAssets) {
            uint256 residualValue = ValueMath.valueFromPriceWad(
                input.debtAssets - repay, input.debtPriceWadPerWhole, input.debtDecimals, Math.Rounding.Ceil
            );
            if (residualValue < input.dustValueWad) revert DustResidual();
        }

        uint256 repayValue =
            ValueMath.valueFromPriceWad(repay, input.debtPriceWadPerWhole, input.debtDecimals, Math.Rounding.Floor);
        uint256 seizeValueTarget = Math.mulDiv(repayValue, input.bonusWad, FixedPoint.WAD, Math.Rounding.Floor);
        uint256 seize = ValueMath.tokensFromValueWad(
            seizeValueTarget, input.collateralPriceWadPerWhole, input.collateralDecimals, Math.Rounding.Floor
        );
        if (seize > input.collateralAssets) seize = input.collateralAssets;
        if (seize == 0) revert ZeroSeize();

        uint256 seizeValue = ValueMath.valueFromPriceWad(
            seize, input.collateralPriceWadPerWhole, input.collateralDecimals, Math.Rounding.Floor
        );
        if (!Math512.mulGte(repayValue, input.bonusWad, seizeValue, FixedPoint.WAD)) revert BonusExceeded();

        q = Quote({repayAssets: repay, seizeAssets: seize, repayValueWad: repayValue, seizeValueWad: seizeValue});
    }

    /// @notice Seize size for an exact repay amount after share rounding.
    /// @dev Used when debt-share rounding pulls slightly less than the quoted repay. The bonus check is repeated.
    function seizeForRepay(
        uint256 repayAssets,
        uint256 collateralAssets,
        uint256 bonusWad,
        uint256 debtPriceWadPerWhole,
        uint256 collateralPriceWadPerWhole,
        uint8 debtDecimals,
        uint8 collateralDecimals
    ) public pure returns (uint256 seizeAssets, uint256 repayValueWad, uint256 seizeValueWad) {
        if (bonusWad < FixedPoint.WAD) revert BadBonus();
        if (repayAssets == 0) revert NothingToRepay();
        repayValueWad =
            ValueMath.valueFromPriceWad(repayAssets, debtPriceWadPerWhole, debtDecimals, Math.Rounding.Floor);
        uint256 seizeValueTarget = Math.mulDiv(repayValueWad, bonusWad, FixedPoint.WAD, Math.Rounding.Floor);
        seizeAssets = ValueMath.tokensFromValueWad(
            seizeValueTarget, collateralPriceWadPerWhole, collateralDecimals, Math.Rounding.Floor
        );
        if (seizeAssets > collateralAssets) seizeAssets = collateralAssets;
        if (seizeAssets == 0) revert ZeroSeize();
        seizeValueWad = ValueMath.valueFromPriceWad(
            seizeAssets, collateralPriceWadPerWhole, collateralDecimals, Math.Rounding.Floor
        );
        if (!Math512.mulGte(repayValueWad, bonusWad, seizeValueWad, FixedPoint.WAD)) revert BonusExceeded();
    }
}
