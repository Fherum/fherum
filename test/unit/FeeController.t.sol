// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {FeeController} from "../../src/FeeController.sol";
import {Market} from "../../src/Market.sol";
import {G4Fixture} from "../utils/G4Fixture.sol";

contract FeeControllerTest is G4Fixture {
    address internal protocolSafe = makeAddr("protocolSafe");
    address internal curatorSafe = makeAddr("curatorSafe");
    Market internal spoke;
    FeeController internal fees;

    function setUp() public override {
        super.setUp();
        spoke = _createCuratedMarket();
        fees = new FeeController(spoke, address(timelock), protocolSafe, curatorSafe, 0.3e18);
        vm.prank(governor);
        bytes32 id = registry.queueFeeRecipient(address(spoke), address(fees));
        vm.warp(vm.getBlockTimestamp() + MIN_DELAY);
        registry.execute(id);
        assertEq(spoke.feeRecipient(), address(fees));
        _approveSpoke(alice, spoke);
        _approveSpoke(bob, spoke);
        _fundG4(alice);
        _fundG4(bob);
        _poke();
        vm.prank(alice);
        spoke.supply(10_000e18);
        vm.startPrank(bob);
        spoke.addCollateral(10_000e18);
        spoke.borrow(5_000e18);
        vm.stopPrank();
    }

    function _fundG4(address user) internal {
        borrowToken.mint(user, 1_000_000e18);
        collateralToken.mint(user, 1_000_000e18);
    }

    function test_splitAndClaim_dustToProtocol() public {
        vm.warp(vm.getBlockTimestamp() + 365 days);
        fees.distribute();
        uint256 held = spoke.supplyShares(address(fees));
        assertGt(held, 0);
        assertEq(fees.protocolShares() + fees.curatorShares(), held);
        assertEq(fees.curatorShares(), held * 0.3e18 / 1e18);

        (uint256 p, uint256 c) = fees.claimable();
        _poke();
        fees.claimCurator(type(uint256).max);
        fees.claimProtocol(type(uint256).max);
        assertApproxEqAbs(borrowToken.balanceOf(curatorSafe), c, 1);
        assertApproxEqAbs(borrowToken.balanceOf(protocolSafe), p, 1);
        assertLe(fees.protocolShares() + fees.curatorShares(), spoke.supplyShares(address(fees)));
    }

    function test_nothingToClaimReverts() public {
        vm.expectRevert(FeeController.NothingToClaim.selector);
        fees.claimCurator(1);
    }

    function test_bounds_andTimelockOnly() public {
        try new FeeController(spoke, address(timelock), protocolSafe, curatorSafe, 0.51e18) {
            fail();
        } catch (bytes memory err) {
            assertEq(bytes4(err), FeeController.BadCuratorShare.selector);
        }

        vm.prank(governor);
        vm.expectRevert();
        fees.setCuratorShare(0.1e18); // governor is not the controller admin; only the timelock is

        vm.prank(curator);
        vm.expectRevert();
        registry.queueCuratorFeeShare(fees, 0.1e18); // admin path, not curator

        vm.prank(governor);
        bytes32 id = registry.queueCuratorFeeShare(fees, 0.1e18);
        vm.expectRevert();
        registry.execute(id);
        vm.warp(vm.getBlockTimestamp() + MIN_DELAY);
        registry.execute(id);
        assertEq(fees.curatorShareWad(), 0.1e18);

        vm.prank(governor);
        id = registry.queueCuratorFeeShare(fees, 0.6e18);
        vm.warp(vm.getBlockTimestamp() + MIN_DELAY);
        vm.expectRevert();
        registry.execute(id);
    }

    function test_shareChangeKeepsPastSplit() public {
        vm.warp(vm.getBlockTimestamp() + 180 days);
        vm.prank(governor);
        bytes32 id = registry.queueCuratorFeeShare(fees, 0);
        vm.warp(vm.getBlockTimestamp() + MIN_DELAY);
        registry.execute(id);
        uint256 curatorBefore = fees.curatorShares();
        assertGt(curatorBefore, 0);
        vm.warp(vm.getBlockTimestamp() + 180 days);
        fees.distribute();
        assertEq(fees.curatorShares(), curatorBefore);
    }

    function test_recipientsTimelocked() public {
        vm.prank(governor);
        bytes32 id = registry.queueFeeRecipients(fees, curatorSafe, protocolSafe);
        vm.warp(vm.getBlockTimestamp() + MIN_DELAY);
        registry.execute(id);
        assertEq(fees.protocolRecipient(), curatorSafe);
    }

    function test_targetHfQueuedByCurator() public {
        vm.prank(curator);
        bytes32 id = registry.queueTargetHealthFactor(address(spoke), 1.1e18);
        vm.warp(vm.getBlockTimestamp() + MIN_DELAY);
        registry.execute(id);
        assertEq(spoke.targetHealthFactorWad(), 1.1e18);
    }
}
