// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {FixedPoint} from "./libraries/FixedPoint.sol";

/// @title InterestRateModel
/// @notice Kinked utilization curve. Parameters are passed in so each market can configure its own curve.
/// @dev For U <= Uopt:  Rb = R0 + S1 * U / Uopt
///      For U >  Uopt:  Rb = R0 + S1 + S2 * (U - Uopt) / (1 - Uopt)
///      Rates are annual WAD (1e18 = 100% per 365-day year) and are applied linearly inside ReserveAccounting.
///      This is not an Aave interest-rate contract and does not import Aave code.
contract InterestRateModel {
    struct RateParams {
        uint256 baseRateWad;
        uint256 slope1Wad;
        uint256 slope2Wad;
        uint256 optimalUtilWad;
    }

    uint256 internal constant MIN_OPTIMAL = 0.01e18;
    uint256 internal constant MAX_OPTIMAL = 0.99e18;
    uint256 internal constant MAX_BASE = 1e18;
    uint256 internal constant MAX_SLOPE_1 = 1e18;
    uint256 internal constant MAX_SLOPE_2 = 3e18;

    error BadOptimalUtilization();
    error BadRateParam();
    error ReserveFactorOutOfRange();

    function validate(RateParams memory params) public pure {
        if (params.optimalUtilWad < MIN_OPTIMAL || params.optimalUtilWad > MAX_OPTIMAL) {
            revert BadOptimalUtilization();
        }
        if (params.baseRateWad > MAX_BASE || params.slope1Wad > MAX_SLOPE_1 || params.slope2Wad > MAX_SLOPE_2) {
            revert BadRateParam();
        }
    }

    function borrowRatePerYearWad(RateParams memory params, uint256 utilizationWad) external pure returns (uint256) {
        validate(params);
        if (utilizationWad > FixedPoint.WAD) utilizationWad = FixedPoint.WAD;
        if (utilizationWad <= params.optimalUtilWad) {
            return params.baseRateWad
                + Math.mulDiv(params.slope1Wad, utilizationWad, params.optimalUtilWad, Math.Rounding.Floor);
        }
        uint256 excess = utilizationWad - params.optimalUtilWad;
        uint256 span = FixedPoint.WAD - params.optimalUtilWad;
        return params.baseRateWad + params.slope1Wad + Math.mulDiv(params.slope2Wad, excess, span, Math.Rounding.Floor);
    }

    /// @notice Estimate of supplier APR: borrowRate * utilization * (1 - reserveFactor).
    /// @dev This is an estimate of the instantaneous rate. Realized supplier yield is the supply index.
    function supplyRatePerYearWad(uint256 borrowRateWad, uint256 utilizationWad, uint256 reserveFactorWad)
        external
        pure
        returns (uint256)
    {
        if (reserveFactorWad > FixedPoint.WAD) revert ReserveFactorOutOfRange();
        if (utilizationWad > FixedPoint.WAD) utilizationWad = FixedPoint.WAD;
        uint256 gross = Math.mulDiv(borrowRateWad, utilizationWad, FixedPoint.WAD, Math.Rounding.Floor);
        return Math.mulDiv(gross, FixedPoint.WAD - reserveFactorWad, FixedPoint.WAD, Math.Rounding.Floor);
    }
}
