// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @notice Market privacy posture.
/// @dev G2 ships Public only. Confidential is reserved in the enum so callers can see the
///      future value, and no G2 function is allowed to select or report it.
enum PrivacyMode {
    Public,
    Confidential
}
