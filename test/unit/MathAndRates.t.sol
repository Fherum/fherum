// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {InterestRateModel} from "../../src/InterestRateModel.sol";
import {FixedPoint} from "../../src/libraries/FixedPoint.sol";
import {Math512} from "../../src/libraries/Math512.sol";
import {ReserveAccounting} from "../../src/libraries/ReserveAccounting.sol";
import {ValueMath} from "../../src/libraries/ValueMath.sol";

contract MathAndRatesTest is Test {
    InterestRateModel internal irm;

    function setUp() public {
        irm = new InterestRateModel();
    }

    function _params() internal pure returns (InterestRateModel.RateParams memory p) {
        p.baseRateWad = 0;
        p.slope1Wad = 0.04e18;
        p.slope2Wad = 0.75e18;
        p.optimalUtilWad = 0.8e18;
    }

    function test_kinkCurveMatchesClosedForm() public view {
        InterestRateModel.RateParams memory p = _params();
        assertEq(irm.borrowRatePerYearWad(p, 0), 0);
        assertEq(irm.borrowRatePerYearWad(p, 0.4e18), 0.02e18);
        assertEq(irm.borrowRatePerYearWad(p, 0.8e18), 0.04e18);
        assertEq(irm.borrowRatePerYearWad(p, 0.8e18 + 1), 0.04e18 + 3);
        assertEq(irm.borrowRatePerYearWad(p, 0.9e18), 0.415e18);
        assertEq(irm.borrowRatePerYearWad(p, 1e18), 0.79e18);
    }

    function test_supplyRateEstimate() public view {
        // 2.5% borrow, 50% util, 10% reserve factor => 1.125%.
        uint256 supply = irm.supplyRatePerYearWad(0.025e18, 0.5e18, 0.1e18);
        assertEq(supply, 0.01125e18);
    }

    function test_rateParamsRejectBadKink() public {
        InterestRateModel.RateParams memory p = _params();
        p.optimalUtilWad = 0;
        vm.expectRevert(InterestRateModel.BadOptimalUtilization.selector);
        irm.validate(p);
        p.optimalUtilWad = 1e18;
        vm.expectRevert(InterestRateModel.BadOptimalUtilization.selector);
        irm.validate(p);
        p = _params();
        p.slope2Wad = 4e18;
        vm.expectRevert(InterestRateModel.BadRateParam.selector);
        irm.validate(p);
    }

    function test_utilizationDefinition() public pure {
        assertEq(ReserveAccounting.utilizationWad(0, 0), 0);
        assertEq(ReserveAccounting.utilizationWad(1, 0), FixedPoint.WAD);
        assertEq(ReserveAccounting.utilizationWad(50, 100), 0.5e18);
        assertEq(ReserveAccounting.utilizationWad(100, 100), FixedPoint.WAD);
        assertEq(ReserveAccounting.utilizationWad(150, 100), FixedPoint.WAD);
    }

    function test_shareRoundingDirections() public pure {
        uint256 index = 1.5e27;
        assertEq(ReserveAccounting.supplyAssets(2, index), 3);
        assertEq(ReserveAccounting.debtAssets(2, index), 3);
        assertEq(ReserveAccounting.debtAssets(1, index), 2);
        assertEq(ReserveAccounting.supplyAssets(1, index), 1);
    }

    function test_oneYearAccrualVector() public pure {
        ReserveAccounting.Reserve memory r;
        r.supplyIndex = FixedPoint.RAY;
        r.borrowIndex = FixedPoint.RAY;
        r.lastAccrual = 1;
        r.totalSupplyShares = 1000e18;
        r.totalBorrowShares = 500e18;

        (uint256 interest, uint256 feeShares) = ReserveAccounting.accrue(r, 0.025e18, 0.1e18, 1 + 365 days);
        assertEq(interest, 12.5e18);
        assertEq(r.borrowIndex, 1.025e27);
        assertEq(r.supplyIndex, 1.01125e27);
        assertEq(feeShares, 1_236_093_943_139_678_615);
        assertEq(r.totalSupplyShares, 1000e18 + feeShares);
        assertEq(ReserveAccounting.debtAssets(r.totalBorrowShares, r.borrowIndex), 512.5e18);
        uint256 supplyAssets = ReserveAccounting.supplyAssets(r.totalSupplyShares, r.supplyIndex);
        assertEq(supplyAssets, 1_012_499_999_999_999_999_999);
        assertGe(500e18 + 512.5e18, supplyAssets);
    }

    function test_valueMathUsdExampleAndSixDecimals() public pure {
        uint256 eighteen = ValueMath.toValueWad(10_000e18, 1e8, 8, 18, Math.Rounding.Floor);
        assertEq(eighteen, 10_000e18);
        uint256 six = ValueMath.toValueWad(1_000e6, 2e8, 8, 6, Math.Rounding.Floor);
        assertEq(six, 2_000e18);
        uint256 priceWad = ValueMath.priceWadPerWholeToken(2e8, 8);
        uint256 tokens = ValueMath.tokensFromValueWad(105e18, priceWad, 18, Math.Rounding.Floor);
        assertEq(tokens, 52.5e18);
        uint256 seizeValue = ValueMath.valueFromPriceWad(tokens, priceWad, 18, Math.Rounding.Floor);
        assertTrue(Math512.mulGte(100e18, 1.05e18, seizeValue, 1e18));
    }

    function test_zeroPriceReverts() public {
        vm.expectRevert(ValueMath.ZeroPrice.selector);
        this.externalZeroPrice();
    }

    function externalZeroPrice() external pure {
        ValueMath.toValueWad(1, 0, 8, 18, Math.Rounding.Floor);
    }
}
