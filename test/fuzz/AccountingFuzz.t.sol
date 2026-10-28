// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {InterestRateModel} from "../../src/InterestRateModel.sol";
import {LiquidationEngine} from "../../src/LiquidationEngine.sol";
import {FixedPoint} from "../../src/libraries/FixedPoint.sol";
import {Math512} from "../../src/libraries/Math512.sol";
import {ReserveAccounting} from "../../src/libraries/ReserveAccounting.sol";
import {ValueMath} from "../../src/libraries/ValueMath.sol";

contract AccountingFuzzTest is Test {
    InterestRateModel internal irm;
    LiquidationEngine internal engine;

    function setUp() public {
        irm = new InterestRateModel();
        engine = new LiquidationEngine();
    }

    function testFuzz_rateIsNonDecreasing(uint256 u1, uint256 u2) public view {
        u1 = bound(u1, 0, FixedPoint.WAD);
        u2 = bound(u2, u1, FixedPoint.WAD);
        InterestRateModel.RateParams memory p = InterestRateModel.RateParams({
            baseRateWad: 0.01e18, slope1Wad: 0.04e18, slope2Wad: 0.75e18, optimalUtilWad: 0.8e18
        });
        assertLe(irm.borrowRatePerYearWad(p, u1), irm.borrowRatePerYearWad(p, u2));
    }

    function testFuzz_indexDoesNotDecrease(
        uint96 supplyShares,
        uint96 borrowShares,
        uint64 rate,
        uint32 dt,
        uint64 reserveFactor
    ) public pure {
        rate = uint64(bound(rate, 0, 5e18));
        dt = uint32(bound(dt, 0, 3650 days));
        reserveFactor = uint64(bound(reserveFactor, 0, 0.5e18));

        ReserveAccounting.Reserve memory r;
        r.supplyIndex = FixedPoint.RAY;
        r.borrowIndex = FixedPoint.RAY;
        r.lastAccrual = 1;
        r.totalSupplyShares = supplyShares;
        r.totalBorrowShares = borrowShares;
        uint256 oldSupply = r.supplyIndex;
        uint256 oldBorrow = r.borrowIndex;
        ReserveAccounting.accrue(r, rate, reserveFactor, 1 + dt);
        assertGe(r.supplyIndex, oldSupply);
        assertGe(r.borrowIndex, oldBorrow);
        assertGe(r.supplyIndex, FixedPoint.RAY);
        assertGe(r.borrowIndex, FixedPoint.RAY);
    }

    function testFuzz_mulGteMatchesUint128(uint128 a, uint128 b, uint128 c, uint128 d) public pure {
        bool expected = uint256(a) * uint256(b) >= uint256(c) * uint256(d);
        assertEq(Math512.mulGte(a, b, c, d), expected);
    }

    function testFuzz_valueFloorRoundTrip(uint128 amount, uint64 rawPrice) public pure {
        rawPrice = uint64(bound(rawPrice, 1, 1e12));
        uint256 value = ValueMath.toValueWad(amount, rawPrice, 8, 18, Math.Rounding.Floor);
        uint256 priceWad = ValueMath.priceWadPerWholeToken(rawPrice, 8);
        uint256 back = ValueMath.tokensFromValueWad(value, priceWad, 18, Math.Rounding.Floor);
        assertLe(back, amount);
    }

    function testFuzz_liquidationQuoteRespectsBonus(
        uint96 debtAssets,
        uint96 collateralAssets,
        uint96 repay,
        uint256 bonusWad,
        uint64 debtPrice,
        uint64 collPrice
    ) public view {
        debtAssets = uint96(bound(debtAssets, 1e6, 1e24));
        collateralAssets = uint96(bound(collateralAssets, 1e6, 1e24));
        repay = uint96(bound(repay, 1, debtAssets));
        bonusWad = bound(bonusWad, 1e18, 1.15e18);
        debtPrice = uint64(bound(debtPrice, 1e6, 1e12));
        collPrice = uint64(bound(collPrice, 1e6, 1e12));

        uint256 debtPriceWad = ValueMath.priceWadPerWholeToken(debtPrice, 8);
        uint256 collPriceWad = ValueMath.priceWadPerWholeToken(collPrice, 8);
        uint256 debtValue = ValueMath.valueFromPriceWad(debtAssets, debtPriceWad, 18, Math.Rounding.Ceil);
        uint256 collValue = ValueMath.valueFromPriceWad(collateralAssets, collPriceWad, 18, Math.Rounding.Floor);

        try engine.quote(
            LiquidationEngine.QuoteInput({
                debtAssets: debtAssets,
                collateralAssets: collateralAssets,
                repayRequested: repay,
                debtValueWad: debtValue,
                collateralValueWad: collValue,
                bonusWad: bonusWad,
                closeFactorWad: 0.5e18,
                dustValueWad: 100e18,
                debtPriceWadPerWhole: debtPriceWad,
                collateralPriceWadPerWhole: collPriceWad,
                debtDecimals: 18,
                collateralDecimals: 18
            })
        ) returns (
            LiquidationEngine.Quote memory q
        ) {
            assertTrue(Math512.mulGte(q.repayValueWad, bonusWad, q.seizeValueWad, FixedPoint.WAD));
            assertLe(q.seizeAssets, collateralAssets);
            assertLe(q.repayAssets, debtAssets);
            assertLe(q.repayAssets, repay);
            assertGt(q.repayAssets, 0);
            assertGt(q.seizeAssets, 0);
        } catch {}
    }
}
