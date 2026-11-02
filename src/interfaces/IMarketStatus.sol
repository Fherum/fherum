// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @notice Policy hook for assets whose reference market can close (e.g. tokenized stocks).
/// @dev Set per feed on OracleAdapter. When `isOpen` returns false or reverts, the price is treated as
///      unusable and every risk-increasing action that reads it fails closed. Repay and add-collateral
///      never read the oracle, so they stay open.
interface IMarketStatus {
    function isOpen(address asset) external view returns (bool);
}
