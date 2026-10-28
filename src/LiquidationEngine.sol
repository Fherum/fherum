// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {FixedPoint} from "./libraries/FixedPoint.sol";
import {Math512} from "./libraries/Math512.sol";
import {ValueMath} from "./libraries/ValueMath.sol";

/// @title LiquidationEngine
/// @notice Pure seize/repay sizing for a single-collateral, single-debt position.
/// @dev Bonus is a WAD multiplier (1.05e18 means the liquidator may receive collateral worth 105% of
///      the repaid debt value). Seize value is rounded down and then checked:
///      `seizeValue * WAD <= repayValue * bonus`.
///      This is a minimal G2 path. Target-HF partials, Dutch bonuses, and bad-debt socialization are later work.
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

    function quote(QuoteInput memory input) external pure returns (Quote memory q) {
        if (input.bonusWad < FixedPoint.WAD) revert BadBonus();
        if (input.debtAssets == 0 || input.repayRequested == 0) revert NothingToRepay();

        uint256 repay = input.repayRequested;
        if (repay > input.debtAssets) repay = input.debtAssets;

        if (input.debtValueWad >= input.dustValueWad) {
            uint256 maxClose = Math.mulDiv(input.debtAssets, input.closeFactorWad, FixedPoint.WAD, Math.Rounding.Floor);
            if (maxClose == 0) revert NothingToRepay();
            if (repay > maxClose) repay = maxClose;
        }

        uint256 maxRepayValue =
            Math.mulDiv(input.collateralValueWad, FixedPoint.WAD, input.bonusWad, Math.Rounding.Floor);
        uint256 maxRepayAssets = ValueMath.tokensFromValueWad(
            maxRepayValue, input.debtPriceWadPerWhole, input.debtDecimals, Math.Rounding.Floor
        );
        if (repay > maxRepayAssets) repay = maxRepayAssets;
        if (repay == 0) revert NothingToRepay();

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
    ) external pure returns (uint256 seizeAssets, uint256 repayValueWad, uint256 seizeValueWad) {
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
