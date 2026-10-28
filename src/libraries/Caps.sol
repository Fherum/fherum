// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @notice Total and per-wallet supply and borrow caps, in asset units (not shares).
/// @dev A cap of 0 rejects the action. Caps are enforced on the action. Later interest accrual
///      may push accounted debt or supply slightly above the cap; new borrows and supplies stay blocked.
library Caps {
    struct Limits {
        uint256 supplyCap;
        uint256 borrowCap;
        uint256 walletSupplyCap;
        uint256 walletBorrowCap;
    }

    error SupplyCapExceeded();
    error BorrowCapExceeded();
    error WalletSupplyCapExceeded();
    error WalletBorrowCapExceeded();

    function checkSupply(Limits memory limits, uint256 newTotalAssets, uint256 newWalletAssets) internal pure {
        if (newTotalAssets > limits.supplyCap) revert SupplyCapExceeded();
        if (newWalletAssets > limits.walletSupplyCap) revert WalletSupplyCapExceeded();
    }

    function checkBorrow(Limits memory limits, uint256 newTotalAssets, uint256 newWalletAssets) internal pure {
        if (newTotalAssets > limits.borrowCap) revert BorrowCapExceeded();
        if (newWalletAssets > limits.walletBorrowCap) revert WalletBorrowCapExceeded();
    }
}
