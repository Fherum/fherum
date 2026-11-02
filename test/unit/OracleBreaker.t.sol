// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IMarketStatus} from "../../src/interfaces/IMarketStatus.sol";
import {OracleAdapter} from "../../src/OracleAdapter.sol";
import {ProtocolFixture} from "../utils/ProtocolFixture.sol";

contract MockMarketStatus is IMarketStatus {
    bool public open = true;
    bool public broken;

    function set(bool open_, bool broken_) external {
        open = open_;
        broken = broken_;
    }

    function isOpen(address) external view returns (bool) {
        require(!broken, "down");
        return open;
    }
}

contract OracleBreakerTest is ProtocolFixture {
    MockMarketStatus internal status;

    function setUp() public override {
        super.setUp();
        status = new MockMarketStatus();
        vm.prank(alice);
        market.supply(10_000e18);
        vm.prank(bob);
        market.addCollateral(1_000e18);
    }

    function test_deviation_onlyGovernorAndBounded() public {
        vm.prank(curator);
        vm.expectRevert();
        oracle.setMaxDeviation(address(collateralToken), 100);
        vm.startPrank(governor);
        vm.expectRevert(OracleAdapter.BadFeedConfig.selector);
        oracle.setMaxDeviation(address(collateralToken), 5_001);
        oracle.setMaxDeviation(address(collateralToken), 1_000);
        vm.stopPrank();
        assertEq(oracle.maxDeviationBps(address(collateralToken)), 1_000);
    }

    function test_deviation_firstRoundUsesSeededReferenceThenFailsClosedWhenStale() public {
        vm.prank(governor);
        oracle.setMaxDeviation(address(collateralToken), 1_000);
        (uint128 refPrice, uint64 refAt) = oracle.lastAccepted(address(collateralToken));
        assertEq(refPrice, 1e8);
        assertEq(refAt, block.timestamp);
        vm.prank(bob);
        market.borrow(100e18); // round 1, no roundId-1: seeded reference is fresh and equal
        // Reference older than maxStaleness (1h): fail closed even though the feed itself is refreshed.
        vm.warp(block.timestamp + 2 hours);
        _poke();
        vm.prank(bob);
        vm.expectRevert(
            abi.encodeWithSelector(OracleAdapter.PreviousRoundUnavailable.selector, address(collateralToken))
        );
        market.borrow(1e18);
    }

    uint80 internal constant PHASE2_FIRST = uint80((uint256(2) << 64) | 1);

    function test_phaseBoundary_inBandVsReferencePasses() public {
        vm.prank(governor);
        oracle.setMaxDeviation(address(collateralToken), 1_000);
        vm.warp(block.timestamp + 1 minutes);
        collateralFeed.setAnswer(1.02e8);
        oracle.poke(address(collateralToken));
        (uint128 refPrice,) = oracle.lastAccepted(address(collateralToken));
        assertEq(refPrice, 1.02e8);
        vm.warp(block.timestamp + 10 minutes);
        collateralFeed.setPhaseAnswer(PHASE2_FIRST, 1.05e8); // +2.9% vs reference
        (uint256 p,,,) = oracle.read(address(collateralToken));
        assertEq(p, 1.05e8);
        vm.prank(bob);
        market.borrow(10e18);
    }

    function test_phaseBoundary_outOfBandVsReferenceReverts() public {
        vm.prank(governor);
        oracle.setMaxDeviation(address(collateralToken), 1_000);
        collateralFeed.setPhaseAnswer(PHASE2_FIRST, 1.5e8);
        vm.expectRevert(abi.encodeWithSelector(OracleAdapter.PriceDeviation.selector, address(collateralToken)));
        oracle.read(address(collateralToken));
        // poke cannot launder an out-of-band price into the reference.
        vm.expectRevert(abi.encodeWithSelector(OracleAdapter.PriceDeviation.selector, address(collateralToken)));
        oracle.poke(address(collateralToken));
    }

    function test_phaseBoundary_staleReferenceFailsClosedThenNextRoundResets() public {
        vm.prank(governor);
        oracle.setMaxDeviation(address(collateralToken), 1_000);
        vm.warp(block.timestamp + 2 hours);
        collateralFeed.setPhaseAnswer(PHASE2_FIRST, 1e8);
        vm.expectRevert(
            abi.encodeWithSelector(OracleAdapter.PreviousRoundUnavailable.selector, address(collateralToken))
        );
        oracle.read(address(collateralToken));
        // Next aggregator round inside phase 2: roundId-1 exists again, breaker auto-resets.
        collateralFeed.setPhaseAnswer(PHASE2_FIRST + 1, 1.01e8);
        oracle.read(address(collateralToken));
        oracle.poke(address(collateralToken));
        (, uint64 at) = oracle.lastAccepted(address(collateralToken));
        assertEq(at, block.timestamp);
    }

    function test_previousRoundReverting_fallsBackToReference() public {
        vm.prank(governor);
        oracle.setMaxDeviation(address(collateralToken), 1_000);
        collateralFeed.setAnswer(1.03e8);
        collateralFeed.setRevertGetRound(true);
        oracle.read(address(collateralToken)); // +3% vs seeded 1e8
        collateralFeed.setAnswer(1.2e8);
        vm.expectRevert(abi.encodeWithSelector(OracleAdapter.PriceDeviation.selector, address(collateralToken)));
        oracle.read(address(collateralToken));
    }

    function test_previousRoundZeroAnswer_fallsBackToReference() public {
        vm.prank(governor);
        oracle.setMaxDeviation(address(collateralToken), 1_000);
        collateralFeed.setPhaseAnswer(5, 1.01e8); // rounds 2..4 never written => getRoundData(4) answer 0
        oracle.read(address(collateralToken));
    }

    function test_pokeIgnoresOlderAndSeedSkipsDisabledFeed() public {
        vm.prank(governor);
        oracle.setMaxDeviation(address(collateralToken), 1_000);
        (, uint64 at0) = oracle.lastAccepted(address(collateralToken));
        oracle.poke(address(collateralToken)); // same updatedAt: no-op
        (, uint64 at1) = oracle.lastAccepted(address(collateralToken));
        assertEq(at0, at1);
        address unknown = makeAddr("unknownAsset");
        vm.prank(governor);
        oracle.setMaxDeviation(unknown, 1_000); // feed not enabled: no seed, no revert
        (uint128 p,) = oracle.lastAccepted(unknown);
        assertEq(p, 0);
        vm.prank(governor);
        vm.expectRevert(OracleAdapter.ZeroAddress.selector);
        oracle.setMaxDeviation(address(0), 1);
    }

    function test_marketStatus_zeroAddressAndClear() public {
        vm.startPrank(governor);
        vm.expectRevert(OracleAdapter.ZeroAddress.selector);
        oracle.setMarketStatus(address(0), status);
        oracle.setMarketStatus(address(collateralToken), status);
        status.set(false, false);
        vm.stopPrank();
        vm.expectRevert(abi.encodeWithSelector(OracleAdapter.MarketClosed.selector, address(collateralToken)));
        oracle.read(address(collateralToken));
        vm.prank(governor);
        oracle.setMarketStatus(address(collateralToken), MockMarketStatus(address(0)));
        oracle.read(address(collateralToken));
    }

    function test_deviation_inBandPassesOutOfBandBlocksRiskIncrease() public {
        vm.prank(governor);
        oracle.setMaxDeviation(address(collateralToken), 1_000);
        collateralFeed.setAnswer(1.05e8); // +5%
        vm.prank(bob);
        market.borrow(100e18);

        collateralFeed.setAnswer(1.3e8); // +23.8%
        vm.startPrank(bob);
        vm.expectRevert(abi.encodeWithSelector(OracleAdapter.PriceDeviation.selector, address(collateralToken)));
        market.borrow(100e18);
        vm.expectRevert(abi.encodeWithSelector(OracleAdapter.PriceDeviation.selector, address(collateralToken)));
        market.removeCollateral(1e18);
        market.repay(bob, 10e18);
        market.addCollateral(1e18);
        vm.stopPrank();

        collateralFeed.setAnswer(1.32e8); // next in-band round clears the breaker
        vm.prank(bob);
        market.borrow(10e18);
    }

    function test_deviation_exactBoundIsAllowed() public {
        vm.prank(governor);
        oracle.setMaxDeviation(address(collateralToken), 1_000);
        collateralFeed.setAnswer(1.1e8);
        (uint256 p,) = oracle.priceWadPerWholeToken(address(collateralToken));
        assertGt(p, 0);
        collateralFeed.setAnswer(0.98e8); // -10.9%
        vm.expectRevert(abi.encodeWithSelector(OracleAdapter.PriceDeviation.selector, address(collateralToken)));
        oracle.priceWadPerWholeToken(address(collateralToken));
    }

    function test_marketClosed_failsClosedAndRepayOpen() public {
        vm.prank(governor);
        oracle.setMarketStatus(address(collateralToken), status);
        vm.prank(bob);
        market.borrow(100e18);

        status.set(false, false);
        vm.startPrank(bob);
        vm.expectRevert(abi.encodeWithSelector(OracleAdapter.MarketClosed.selector, address(collateralToken)));
        market.borrow(1e18);
        market.repay(bob, 1e18);
        market.addCollateral(1e18);
        vm.stopPrank();

        status.set(true, true); // hook reverts -> closed
        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(OracleAdapter.MarketClosed.selector, address(collateralToken)));
        market.borrow(1e18);

        status.set(true, false);
        vm.prank(bob);
        market.borrow(1e18);
    }
}
