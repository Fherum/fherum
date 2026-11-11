// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @notice Minimal scaled-UI-amount surface exposed by Robinhood Chain stock tokens.
/// @dev Verified on chain 4663 (2026-11-11) against all 12 listed stock tokens (beacon 0xe10b…1b00):
///      `uiMultiplier`, `effectiveAt`, `oraclePaused` respond. `newUIMultiplier` is the scheduled value.
interface IERC8056 {
    function uiMultiplier() external view returns (uint256);
    function newUIMultiplier() external view returns (uint256);
    function effectiveAt() external view returns (uint256);
    function oraclePaused() external view returns (bool);
}
