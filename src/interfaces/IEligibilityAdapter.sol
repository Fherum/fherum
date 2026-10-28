// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @title IEligibilityAdapter
/// @notice Optional gate consulted by a market before supply and borrow.
/// @dev A zero adapter on the market means the gate is off. Repay, withdraw, and liquidation do not consult it.
interface IEligibilityAdapter {
    /// @notice Whether `user` may supply the borrow asset or borrow on `market`.
    function isEligible(address market, address user) external view returns (bool);
}
