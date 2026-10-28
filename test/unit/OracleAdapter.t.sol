// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {OracleAdapter} from "../../src/OracleAdapter.sol";
import {ProtocolFixture} from "../utils/ProtocolFixture.sol";

contract OracleAdapterTest is ProtocolFixture {
    function test_validRead() public view {
        (uint256 price, uint8 priceDec, uint8 tokenDec,) = oracle.read(address(borrowToken));
        assertEq(price, 1e8);
        assertEq(priceDec, 8);
        assertEq(tokenDec, 18);
        assertEq(oracle.tokenValueWad(address(borrowToken), 25e18, Math.Rounding.Floor), 25e18);
    }

    function test_staleZeroNegativeAndFutureRevert() public {
        borrowFeed.setUpdatedAt(block.timestamp - 2 hours);
        vm.expectRevert(abi.encodeWithSelector(OracleAdapter.StalePrice.selector, address(borrowToken)));
        oracle.read(address(borrowToken));

        _poke();
        borrowFeed.setAnswer(0);
        vm.expectRevert(abi.encodeWithSelector(OracleAdapter.InvalidPrice.selector, address(borrowToken)));
        oracle.read(address(borrowToken));

        borrowFeed.setAnswer(-5);
        vm.expectRevert(abi.encodeWithSelector(OracleAdapter.InvalidPrice.selector, address(borrowToken)));
        oracle.read(address(borrowToken));

        borrowFeed.setAnswer(1e8);
        borrowFeed.setUpdatedAt(block.timestamp + 30);
        vm.expectRevert(abi.encodeWithSelector(OracleAdapter.InvalidTimestamp.selector, address(borrowToken)));
        oracle.read(address(borrowToken));
    }

    function test_incompleteRoundAndDecimalsAndCap() public {
        borrowFeed.setRound(5, 4);
        vm.expectRevert(abi.encodeWithSelector(OracleAdapter.IncompleteRound.selector, address(borrowToken)));
        oracle.read(address(borrowToken));

        borrowFeed.setRound(5, 5);
        borrowFeed.setDecimals(18);
        vm.expectRevert(abi.encodeWithSelector(OracleAdapter.DecimalsMismatch.selector, address(borrowToken)));
        oracle.read(address(borrowToken));

        borrowFeed.setDecimals(8);
        vm.prank(governor);
        oracle.setFeed(address(borrowToken), address(borrowFeed), 18, 1 hours, 1e8);
        borrowFeed.setAnswer(int256(1e8 + 1));
        vm.expectRevert(abi.encodeWithSelector(OracleAdapter.PriceOutOfBounds.selector, address(borrowToken)));
        oracle.read(address(borrowToken));
    }

    function test_disabledFeedAndStrangerCannotSet() public {
        vm.prank(governor);
        oracle.disableFeed(address(borrowToken));
        vm.expectRevert(abi.encodeWithSelector(OracleAdapter.FeedNotEnabled.selector, address(borrowToken)));
        oracle.read(address(borrowToken));

        vm.prank(alice);
        vm.expectRevert();
        oracle.setFeed(address(borrowToken), address(borrowFeed), 18, 1 hours, 1e8);
    }
}
