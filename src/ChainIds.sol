// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @notice Robinhood Chain identifiers. Product chain for FHERUM. Not an FHE network.
library ChainIds {
    uint256 internal constant ROBINHOOD_MAINNET = 4663;
    uint256 internal constant ROBINHOOD_TESTNET = 46630;
    /// @dev Local Anvil / Forge default. Used only so the dry-run script can be executed in tests.
    uint256 internal constant ANVIL = 31337;
}
