// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {MockERC20} from "./MockERC20.sol";

/// @notice ERC20 with the ERC-8056 scaled-UI surface used by Robinhood Chain stock tokens.
contract MockStockToken is MockERC20 {
    uint256 internal _mult = 1e18;
    uint256 public newUIMultiplier = 1e18;
    uint256 public effectiveAt;
    bool internal _paused;
    bool public revertOraclePaused;

    constructor(string memory n, string memory s) MockERC20(n, s, 18) {}

    function uiMultiplier() external view returns (uint256) {
        return block.timestamp >= effectiveAt ? newUIMultiplier : _mult;
    }

    /// @dev Immediate change (effective now).
    function setMultiplier(uint256 m) external {
        _mult = m;
        newUIMultiplier = m;
        effectiveAt = block.timestamp;
    }

    /// @dev Scheduled change, mirrors the issuer's setUIMultiplier(new, effectiveAt).
    function schedule(uint256 m, uint256 at) external {
        _mult = block.timestamp >= effectiveAt ? newUIMultiplier : _mult;
        newUIMultiplier = m;
        effectiveAt = at;
    }

    function oraclePaused() external view returns (bool) {
        require(!revertOraclePaused, "boom");
        return _paused;
    }

    function setOraclePaused(bool p) external {
        _paused = p;
    }

    function setRevertOraclePaused(bool r) external {
        revertOraclePaused = r;
    }
}
