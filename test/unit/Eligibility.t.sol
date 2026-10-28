// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Market} from "../../src/Market.sol";
import {G4Fixture} from "../utils/G4Fixture.sol";

contract EligibilityTest is G4Fixture {
    function test_gateOffByDefault() public {
        assertEq(address(market.eligibility()), address(0));
        vm.prank(alice);
        market.supply(25e18);
        assertEq(market.supplyShares(alice), 25e18);
    }

    function test_deniedCannotEnterAndAllowedCan() public {
        vm.prank(governor);
        market.setEligibility(eligibility);

        vm.prank(alice);
        vm.expectRevert(Market.NotEligible.selector);
        market.supply(1e18);

        vm.prank(alice);
        vm.expectRevert(Market.NotEligible.selector);
        market.borrow(1e18);

        vm.prank(curator);
        eligibility.setAllowed(address(market), alice, true);

        vm.prank(alice);
        market.supply(40e18);
        assertEq(market.supplyShares(alice), 40e18);

        vm.prank(bob);
        vm.expectRevert(Market.NotEligible.selector);
        market.supply(1e18);

        vm.prank(alice);
        market.addCollateral(100e18);
        vm.prank(alice);
        market.borrow(20e18);
        assertEq(market.debtShares(alice), 20e18);

        vm.prank(bob);
        market.addCollateral(10e18);
        vm.prank(bob);
        vm.expectRevert(Market.NotEligible.selector);
        market.borrow(1e18);
    }

    function test_merkleClaimAllowsOneMarketOnly() public {
        vm.prank(governor);
        market.setEligibility(eligibility);

        bytes32 leafCarol = eligibility.leaf(address(market), carol);
        bytes32 leafBob = eligibility.leaf(address(market), bob);
        bytes32 root = _pair(leafCarol, leafBob);
        vm.prank(curator);
        eligibility.setMerkleRoot(address(market), root);

        bytes32[] memory proof = new bytes32[](1);
        proof[0] = leafBob;
        vm.prank(carol);
        eligibility.claim(address(market), proof);
        assertTrue(eligibility.isEligible(address(market), carol));

        vm.prank(carol);
        market.supply(5e18);
        assertEq(market.supplyShares(carol), 5e18);

        vm.prank(bob);
        vm.expectRevert(Market.NotEligible.selector);
        market.supply(1e18);

        proof[0] = leafCarol;
        vm.prank(bob);
        eligibility.claim(address(market), proof);
        vm.prank(bob);
        market.supply(8e18);

        Market other = _newMarket(address(collateralToken), address(borrowToken));
        _register(other, 800_000e18);
        _approveSpoke(carol, other);
        assertFalse(eligibility.isEligible(address(other), carol));
        vm.prank(governor);
        other.setEligibility(eligibility);
        vm.prank(carol);
        vm.expectRevert(Market.NotEligible.selector);
        other.supply(1e18);
    }

    function test_existingPositionCanExitWhenLaterDenied() public {
        vm.startPrank(alice);
        market.supply(100e18);
        market.addCollateral(100e18);
        market.borrow(20e18);
        vm.stopPrank();

        vm.prank(governor);
        market.setEligibility(eligibility);

        vm.prank(alice);
        vm.expectRevert(Market.NotEligible.selector);
        market.supply(1e18);
        vm.prank(alice);
        vm.expectRevert(Market.NotEligible.selector);
        market.borrow(1e18);

        vm.prank(alice);
        market.repay(alice, type(uint256).max);
        vm.prank(alice);
        market.removeCollateral(100e18);
        vm.prank(alice);
        market.withdraw(100e18);
        assertEq(market.supplyShares(alice), 0);
        assertEq(market.debtShares(alice), 0);
    }

    function test_guardianCannotEditAllowlist() public {
        vm.prank(guardian);
        vm.expectRevert();
        eligibility.setAllowed(address(market), guardian, true);
        vm.prank(guardian);
        vm.expectRevert();
        eligibility.setMerkleRoot(address(market), bytes32(uint256(1)));
        assertFalse(eligibility.isEligible(address(market), guardian));
    }

    function testFuzz_strangerCannotSupply(address stranger) public {
        vm.assume(stranger != address(0));
        vm.prank(governor);
        market.setEligibility(eligibility);
        vm.prank(stranger);
        vm.expectRevert(Market.NotEligible.selector);
        market.supply(1e18);
    }

    function testFuzz_allowlistedSupplyMintsShares(uint96 rawAmount) public {
        uint256 amount = bound(rawAmount, 1e15, 1_000e18);
        vm.prank(governor);
        market.setEligibility(eligibility);
        vm.prank(curator);
        eligibility.setAllowed(address(market), alice, true);
        uint256 beforeShares = market.supplyShares(alice);
        vm.prank(alice);
        market.supply(amount);
        assertEq(market.supplyShares(alice), beforeShares + amount);
        vm.prank(bob);
        vm.expectRevert(Market.NotEligible.selector);
        market.supply(1e18);
    }

    function _pair(bytes32 a, bytes32 b) internal pure returns (bytes32) {
        return a < b ? keccak256(abi.encodePacked(a, b)) : keccak256(abi.encodePacked(b, a));
    }
}
