// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {PlaintextFHEAdapter} from "../../src/PlaintextFHEAdapter.sol";
import {RiskEngine} from "../../src/RiskEngine.sol";
import {Math512} from "../../src/libraries/Math512.sol";

contract PlaintextFHEAdapterTest is Test {
    PlaintextFHEAdapter internal fhe;
    RiskEngine internal risk;

    function setUp() public {
        fhe = new PlaintextFHEAdapter();
        risk = new RiskEngine(fhe);
    }

    function test_roundTripAndArithmetic() public view {
        bytes32 a = fhe.encrypt(40);
        bytes32 b = fhe.encrypt(2);
        assertEq(fhe.decrypt(a), 40);
        assertEq(fhe.decrypt(fhe.store(a)), 40);
        assertEq(fhe.decrypt(fhe.add(a, b)), 42);
        assertEq(fhe.decrypt(fhe.sub(a, b)), 38);
        assertEq(fhe.decrypt(fhe.mulByPlaintext(b, 7)), 14);
        assertTrue(fhe.compareLt(b, a));
        assertTrue(fhe.compareLte(a, a));
        assertTrue(fhe.compareGte(a, b));
        assertTrue(fhe.productGte(a, 3, b, 50));
        assertFalse(fhe.productGte(b, 2, a, 3));
    }

    function test_subUnderflowReverts() public {
        bytes32 one = fhe.encrypt(1);
        bytes32 two = fhe.encrypt(2);
        vm.expectRevert(PlaintextFHEAdapter.Underflow.selector);
        fhe.sub(one, two);
    }

    function test_mulOverflowReverts() public {
        bytes32 word = fhe.encrypt(type(uint256).max);
        vm.expectRevert();
        fhe.mulByPlaintext(word, 2);
    }

    function test_wideProductMatchesNarrowAndExtremes() public view {
        assertTrue(fhe.productGte(fhe.encrypt(type(uint256).max), 2, fhe.encrypt(type(uint256).max), 2));
        assertTrue(fhe.productGte(fhe.encrypt(type(uint256).max), 2, fhe.encrypt(type(uint256).max), 1));
        assertFalse(fhe.productGte(fhe.encrypt(type(uint256).max), 1, fhe.encrypt(type(uint256).max), 2));
        assertTrue(Math512.mulGte(type(uint256).max, type(uint256).max, type(uint256).max, type(uint256).max));
        assertFalse(Math512.mulGte(type(uint256).max, type(uint256).max - 1, type(uint256).max, type(uint256).max));
    }

    function test_neverLabelsPlaintextAsCiphertext() public {
        bytes32 word = fhe.encrypt(123);
        assertFalse(fhe.isEncrypted(word));
        assertFalse(fhe.isEncrypted(bytes32(type(uint256).max)));
        assertFalse(fhe.encryptionAvailable());
        assertEq(fhe.privacyLabel(), "public-plaintext");
        vm.expectRevert(PlaintextFHEAdapter.RefusingToLabelPlaintextAsCiphertext.selector);
        fhe.refuseCiphertextLabel(word);
    }

    function test_healthFactorExampleFromBrief() public view {
        // Collateral value 10_000, LT 80%, debt 5_000. HF = 1.6.
        uint256 coll = 10_000e18;
        uint256 debt = 5_000e18;
        uint256 lt = 0.8e18;
        assertEq(risk.healthFactorWad(coll, debt, lt), 1.6e18);
        assertTrue(risk.isHealthy(fhe.encrypt(coll), fhe.encrypt(debt), lt));
        assertFalse(risk.isLiquidatable(fhe.encrypt(coll), fhe.encrypt(debt), lt));
    }

    function test_hfBoundaryIsNotLiquidatable() public view {
        bytes32 coll = fhe.encrypt(5000e18);
        bytes32 debt = fhe.encrypt(5000e18);
        assertTrue(risk.isHealthy(coll, debt, 1e18));
        assertTrue(risk.withinLtv(coll, debt, 1e18));
        assertFalse(risk.isLiquidatable(coll, debt, 1e18));
        assertEq(risk.healthFactorWad(5000e18, 5000e18, 1e18), 1e18);

        bytes32 under = fhe.encrypt(4999e18);
        assertFalse(risk.isHealthy(under, debt, 1e18));
        assertTrue(risk.isLiquidatable(under, debt, 1e18));
    }

    function test_zeroDebtIsHealthy() public view {
        bytes32 coll = fhe.encrypt(0);
        bytes32 debt = fhe.encrypt(0);
        assertTrue(risk.isHealthy(coll, debt, 0.8e18));
        assertFalse(risk.isLiquidatable(coll, debt, 0.8e18));
        assertEq(risk.healthFactorWad(0, 0, 0.8e18), type(uint256).max);
    }
}
