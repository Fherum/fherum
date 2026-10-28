// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {IAggregatorV3} from "./interfaces/IAggregatorV3.sol";
import {ValueMath} from "./libraries/ValueMath.sol";

/// @title OracleAdapter
/// @notice Reads AggregatorV3-style feeds. Stale, zero, negative, and out-of-range answers revert.
/// @dev Invalid prices fail closed. They are never substituted with zero or with the previous answer.
///      Token decimals are the governor-configured value, checked against `decimals()` when the token exposes it.
contract OracleAdapter is AccessControl {
    struct Feed {
        address aggregator;
        uint8 tokenDecimals;
        uint8 expectedPriceDecimals;
        uint32 maxStaleness;
        uint256 maxAnswer;
        bool enabled;
    }

    mapping(address asset => Feed feed) public feeds;

    event FeedSet(address indexed asset, address indexed aggregator, uint8 tokenDecimals, uint32 maxStaleness);

    error ZeroAddress();
    error FeedNotEnabled(address asset);
    error IncompleteRound(address asset);
    error InvalidPrice(address asset);
    error InvalidTimestamp(address asset);
    error StalePrice(address asset);
    error PriceOutOfBounds(address asset);
    error DecimalsMismatch(address asset);
    error TokenDecimalsMismatch(address asset);
    error BadFeedConfig();

    constructor(address governor) {
        if (governor == address(0)) revert ZeroAddress();
        _grantRole(DEFAULT_ADMIN_ROLE, governor);
    }

    function setFeed(address asset, address aggregator, uint8 tokenDecimals, uint32 maxStaleness, uint256 maxAnswer)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        if (asset == address(0) || aggregator == address(0)) revert ZeroAddress();
        if (maxStaleness == 0 || maxAnswer == 0) revert BadFeedConfig();

        uint8 priceDecimals = IAggregatorV3(aggregator).decimals();
        if (priceDecimals > 18) revert DecimalsMismatch(asset);

        (bool ok, bytes memory data) = asset.staticcall(abi.encodeWithSignature("decimals()"));
        if (ok && data.length >= 32) {
            uint8 reported = abi.decode(data, (uint8));
            if (reported != tokenDecimals) revert TokenDecimalsMismatch(asset);
        }

        feeds[asset] = Feed({
            aggregator: aggregator,
            tokenDecimals: tokenDecimals,
            expectedPriceDecimals: priceDecimals,
            maxStaleness: maxStaleness,
            maxAnswer: maxAnswer,
            enabled: true
        });
        emit FeedSet(asset, aggregator, tokenDecimals, maxStaleness);
    }

    function disableFeed(address asset) external onlyRole(DEFAULT_ADMIN_ROLE) {
        feeds[asset].enabled = false;
    }

    /// @notice Latest valid answer. Reverts when the feed is disabled, stale, non-positive, or incomplete.
    function read(address asset)
        public
        view
        returns (uint256 rawPrice, uint8 priceDecimals, uint8 tokenDecimals, uint256 updatedAt)
    {
        Feed memory feed = feeds[asset];
        if (!feed.enabled || feed.aggregator == address(0)) revert FeedNotEnabled(asset);

        (uint80 roundId, int256 answer, uint256 startedAt, uint256 updated, uint80 answeredInRound) =
            IAggregatorV3(feed.aggregator).latestRoundData();
        if (roundId == 0 || answeredInRound < roundId) revert IncompleteRound(asset);
        if (answer <= 0) revert InvalidPrice(asset);
        if (updated == 0 || updated > block.timestamp || startedAt > block.timestamp) revert InvalidTimestamp(asset);
        if (block.timestamp - updated > feed.maxStaleness) revert StalePrice(asset);

        uint256 price = uint256(answer);
        if (price > feed.maxAnswer) revert PriceOutOfBounds(asset);

        uint8 liveDecimals = IAggregatorV3(feed.aggregator).decimals();
        if (liveDecimals != feed.expectedPriceDecimals) revert DecimalsMismatch(asset);

        return (price, liveDecimals, feed.tokenDecimals, updated);
    }

    function tokenValueWad(address asset, uint256 amount, Math.Rounding rounding) external view returns (uint256) {
        (uint256 rawPrice, uint8 priceDecimals, uint8 tokenDecimals,) = read(asset);
        return ValueMath.toValueWad(amount, rawPrice, priceDecimals, tokenDecimals, rounding);
    }

    function priceWadPerWholeToken(address asset) external view returns (uint256 priceWad, uint8 tokenDecimals) {
        (uint256 rawPrice, uint8 priceDecimals, uint8 tokenDecimals_,) = read(asset);
        priceWad = ValueMath.priceWadPerWholeToken(rawPrice, priceDecimals);
        tokenDecimals = tokenDecimals_;
    }
}
