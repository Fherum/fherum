// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {InterestRateModel} from "../../src/InterestRateModel.sol";
import {LiquidationEngine} from "../../src/LiquidationEngine.sol";
import {PlaintextFHEAdapter} from "../../src/PlaintextFHEAdapter.sol";
import {RiskEngine} from "../../src/RiskEngine.sol";
import {FixedPoint} from "../../src/libraries/FixedPoint.sol";
import {ReserveAccounting} from "../../src/libraries/ReserveAccounting.sol";
import {ValueMath} from "../../src/libraries/ValueMath.sol";
import {ReferenceVectors as RV} from "./ReferenceVectors.sol";

/// @notice Exposes internal library math so vectors hit the exact production code paths.
contract LibHarness {
    function value(uint256 amount, uint256 raw, uint8 pdec, uint8 tdec, bool up) external pure returns (uint256) {
        return ValueMath.toValueWad(amount, raw, pdec, tdec, up ? Math.Rounding.Ceil : Math.Rounding.Floor);
    }

    function util(uint256 debt, uint256 supply) external pure returns (uint256) {
        return ReserveAccounting.utilizationWad(debt, supply);
    }

    function accrue(RV.AccrualV memory v)
        external
        pure
        returns (uint256 bi, uint256 si, uint256 interest, uint256 feeShares)
    {
        ReserveAccounting.Reserve memory r = ReserveAccounting.Reserve({
            totalSupplyShares: v.sShares,
            totalBorrowShares: v.bShares,
            supplyIndex: FixedPoint.RAY,
            borrowIndex: FixedPoint.RAY,
            lastAccrual: 1_000
        });
        (interest, feeShares) = ReserveAccounting.accrue(r, v.rate, v.rf, 1_000 + v.dt);
        return (r.borrowIndex, r.supplyIndex, interest, feeShares);
    }
}

/// @notice Contract math == test/reference/model.py, exactly (all rounding modes are mirrored; no tolerance).
contract ReferenceVectorsTest is Test {
    LibHarness internal h;
    InterestRateModel internal irm;
    LiquidationEngine internal engine;
    RiskEngine internal risk;
    PlaintextFHEAdapter internal fhe;

    function setUp() public {
        h = new LibHarness();
        irm = new InterestRateModel();
        engine = new LiquidationEngine();
        fhe = new PlaintextFHEAdapter();
        risk = new RiskEngine(fhe);
    }

    function test_values() public view {
        RV.ValueV[] memory vs = RV.values();
        for (uint256 i; i < vs.length; i++) {
            RV.ValueV memory v = vs[i];
            assertEq(h.value(v.amount, v.rawPrice, v.priceDecimals, v.tokenDecimals, false), v.down, v.cat);
            assertEq(h.value(v.amount, v.rawPrice, v.priceDecimals, v.tokenDecimals, true), v.up, v.cat);
        }
    }

    function test_healthFactor() public view {
        RV.HfV[] memory vs = RV.hf();
        for (uint256 i; i < vs.length; i++) {
            RV.HfV memory v = vs[i];
            assertEq(risk.healthFactorWad(v.c, v.d, v.lt), v.hf, v.cat);
            assertEq(risk.isLiquidatable(fhe.encrypt(v.c), fhe.encrypt(v.d), v.lt), v.liquidatable, v.cat);
            assertEq(risk.withinLtv(fhe.encrypt(v.c), fhe.encrypt(v.d), 0.75e18), v.withinLtv, v.cat);
        }
    }

    function test_rates() public view {
        RV.RateV[] memory vs = RV.rates();
        for (uint256 i; i < vs.length; i++) {
            RV.RateV memory v = vs[i];
            if (v.fromUtil) assertEq(h.util(v.debt, v.supply), v.u, v.cat);
            InterestRateModel.RateParams memory p = InterestRateModel.RateParams(v.base, v.s1, v.s2, v.opt);
            assertEq(irm.borrowRatePerYearWad(p, v.u), v.rate, v.cat);
        }
    }

    function test_accrual() public view {
        RV.AccrualV[] memory vs = RV.accrual();
        for (uint256 i; i < vs.length; i++) {
            RV.AccrualV memory v = vs[i];
            (uint256 bi, uint256 si, uint256 interest, uint256 feeShares) = h.accrue(v);
            assertEq(bi, v.borrowIndex, v.cat);
            assertEq(si, v.supplyIndex, v.cat);
            assertEq(interest, v.interest, v.cat);
            assertEq(feeShares, v.feeShares, v.cat);
        }
    }

    function test_liquidation() public view {
        RV.LiqV[] memory vs = RV.liquidation();
        for (uint256 i; i < vs.length; i++) {
            _checkLiq(vs[i]);
        }
    }

    function _checkLiq(RV.LiqV memory v) internal view {
        (bool ok, uint256 repay, uint256 seize, bytes4 sel) = _quote(_input(v));
        string memory cat = v.cat;
        if (ok) {
            assertEq(bytes(v.err).length, 0, cat);
            assertEq(repay, v.repay, cat);
            assertEq(seize, v.seize, cat);
        } else {
            assertEq(sel, _wantSelector(v.err), cat);
        }
    }

    function _quote(LiquidationEngine.QuoteInput memory q)
        internal
        view
        returns (bool ok, uint256 repay, uint256 seize, bytes4 sel)
    {
        try engine.quote(q) returns (LiquidationEngine.Quote memory r) {
            return (true, r.repayAssets, r.seizeAssets, bytes4(0));
        } catch (bytes memory err) {
            return (false, 0, 0, bytes4(err));
        }
    }

    function _input(RV.LiqV memory v) internal pure returns (LiquidationEngine.QuoteInput memory q) {
        q = LiquidationEngine.QuoteInput({
            debtAssets: v.debtAssets,
            collateralAssets: v.collateralAssets,
            repayRequested: v.repayRequested,
            debtValueWad: ValueMath.valueFromPriceWad(v.debtAssets, v.debtPrice, v.debtDecimals, Math.Rounding.Ceil),
            collateralValueWad: ValueMath.valueFromPriceWad(
                v.collateralAssets, v.collPrice, v.collDecimals, Math.Rounding.Floor
            ),
            bonusWad: v.p.bonus,
            closeFactorWad: v.p.closeFactor,
            dustValueWad: v.p.dust,
            debtPriceWadPerWhole: v.debtPrice,
            collateralPriceWadPerWhole: v.collPrice,
            debtDecimals: v.debtDecimals,
            collateralDecimals: v.collDecimals,
            liquidationThresholdWad: v.p.lt,
            targetHealthFactorWad: v.p.targetHf
        });
    }

    function _wantSelector(string memory e) internal pure returns (bytes4) {
        bytes32 k = keccak256(bytes(e));
        if (k == keccak256("DustResidual")) return LiquidationEngine.DustResidual.selector;
        if (k == keccak256("NothingToRepay")) return LiquidationEngine.NothingToRepay.selector;
        if (k == keccak256("ZeroSeize")) return LiquidationEngine.ZeroSeize.selector;
        return bytes4(0);
    }
}
