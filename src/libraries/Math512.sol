// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

/// @notice 512-bit product comparisons. Used so Health Factor and liquidation bonus checks
///         do not overflow when `a * scale` does not fit in uint256.
library Math512 {
    /// @dev True when `a * b >= c * d` over the full 512-bit products.
    function mulGte(uint256 a, uint256 b, uint256 c, uint256 d) internal pure returns (bool) {
        (uint256 leftHi, uint256 leftLo) = Math.mul512(a, b);
        (uint256 rightHi, uint256 rightLo) = Math.mul512(c, d);
        if (leftHi != rightHi) return leftHi > rightHi;
        return leftLo >= rightLo;
    }
}
