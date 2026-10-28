// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {IFHEAdapter} from "./interfaces/IFHEAdapter.sol";
import {FixedPoint} from "./libraries/FixedPoint.sol";

/// @title RiskEngine
/// @notice Health Factor and LTV checks. Inputs are adapter words holding public quote values in G2.
/// @dev The gate is `collateralValue * factor >= debtValue * WAD`, compared through IFHEAdapter.productGte.
///      `healthFactorWad` is the floored quotient and is informational. A position is healthy when the
///      product comparison passes, which implies the floored Health Factor is at least 1e18.
///      Liquidation threshold and LTV are different parameters. HF uses the liquidation threshold.
contract RiskEngine {
    IFHEAdapter public immutable fhe;

    error ZeroAddress();

    constructor(IFHEAdapter fhe_) {
        if (address(fhe_) == address(0)) revert ZeroAddress();
        fhe = fhe_;
    }

    function isHealthy(bytes32 collateralValueWad, bytes32 debtValueWad, uint256 liquidationThresholdWad)
        external
        view
        returns (bool)
    {
        if (fhe.decrypt(debtValueWad) == 0) return true;
        return fhe.productGte(collateralValueWad, liquidationThresholdWad, debtValueWad, FixedPoint.WAD);
    }

    function withinLtv(bytes32 collateralValueWad, bytes32 debtValueWad, uint256 ltvWad) external view returns (bool) {
        if (fhe.decrypt(debtValueWad) == 0) return true;
        return fhe.productGte(collateralValueWad, ltvWad, debtValueWad, FixedPoint.WAD);
    }

    /// @dev Liquidatable only when debt value is non-zero and the LT product comparison fails.
    ///      Equality (HF == 1) is not liquidatable.
    function isLiquidatable(bytes32 collateralValueWad, bytes32 debtValueWad, uint256 liquidationThresholdWad)
        external
        view
        returns (bool)
    {
        if (fhe.decrypt(debtValueWad) == 0) return false;
        return !fhe.productGte(collateralValueWad, liquidationThresholdWad, debtValueWad, FixedPoint.WAD);
    }

    /// @notice Floored Health Factor in WAD. Returns max uint when debt value is zero.
    /// @dev Informational. Solvency gates use `isHealthy` / `withinLtv`.
    function healthFactorWad(uint256 collateralValueWad, uint256 debtValueWad, uint256 liquidationThresholdWad)
        external
        pure
        returns (uint256)
    {
        if (debtValueWad == 0) return type(uint256).max;
        return Math.mulDiv(collateralValueWad, liquidationThresholdWad, debtValueWad, Math.Rounding.Floor);
    }
}
