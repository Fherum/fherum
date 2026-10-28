// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

/// @notice Convert token amounts and oracle answers into WAD quote values.
/// @dev Quote scale: 1e18 = 1 unit of the oracle quote (USD for the feeds this protocol expects).
///      Collateral values round down. Debt values round up. Both directions are explicit at the call site.
///      Price decimals above 18 are rejected. Chainlink-style feeds use 8.
library ValueMath {
    error PriceDecimalsTooHigh();
    error ZeroPrice();
    error PriceOverflow();

    /// @notice Oracle answer scaled to WAD per one whole token (10**tokenDecimals raw units).
    function priceWadPerWholeToken(uint256 rawPrice, uint8 priceDecimals) internal pure returns (uint256) {
        if (priceDecimals > 18) revert PriceDecimalsTooHigh();
        if (rawPrice == 0) revert ZeroPrice();
        uint256 scale = 10 ** uint256(18 - priceDecimals);
        if (rawPrice > type(uint256).max / scale) revert PriceOverflow();
        return rawPrice * scale;
    }

    function toValueWad(
        uint256 amount,
        uint256 rawPrice,
        uint8 priceDecimals,
        uint8 tokenDecimals,
        Math.Rounding rounding
    ) internal pure returns (uint256) {
        return valueFromPriceWad(amount, priceWadPerWholeToken(rawPrice, priceDecimals), tokenDecimals, rounding);
    }

    function valueFromPriceWad(uint256 amount, uint256 priceWadPerWhole, uint8 tokenDecimals, Math.Rounding rounding)
        internal
        pure
        returns (uint256)
    {
        if (priceWadPerWhole == 0) revert ZeroPrice();
        return Math.mulDiv(amount, priceWadPerWhole, 10 ** uint256(tokenDecimals), rounding);
    }

    /// @notice Token raw amount from a WAD quote value. Round down when sizing a liquidation seize.
    function tokensFromValueWad(uint256 valueWad, uint256 priceWadPerWhole, uint8 tokenDecimals, Math.Rounding rounding)
        internal
        pure
        returns (uint256)
    {
        if (priceWadPerWhole == 0) revert ZeroPrice();
        return Math.mulDiv(valueWad, 10 ** uint256(tokenDecimals), priceWadPerWhole, rounding);
    }
}
