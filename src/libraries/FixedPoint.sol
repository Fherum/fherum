// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @notice Fixed-point scales used across the money market.
/// @dev WAD is 1e18 (rates, LTV, liquidation threshold, Health Factor, USD values).
///      RAY is 1e27 (supply and borrow indexes).
library FixedPoint {
    uint256 internal constant WAD = 1e18;
    uint256 internal constant RAY = 1e27;
    uint256 internal constant SECONDS_PER_YEAR = 365 days;
    uint256 internal constant WAD_RAY_RATIO = 1e9;
}
