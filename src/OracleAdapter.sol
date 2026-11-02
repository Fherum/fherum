// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {IAggregatorV3} from "./interfaces/IAggregatorV3.sol";
import {IMarketStatus} from "./interfaces/IMarketStatus.sol";
import {ValueMath} from "./libraries/ValueMath.sol";

/// @title OracleAdapter
/// @notice Reads AggregatorV3-style feeds. Stale, zero, negative, and out-of-range answers revert.
/// @dev Invalid prices fail closed. They are never substituted with zero or with the previous answer.
///      Token decimals are the governor-configured value, checked against `decimals()` when the token exposes it.
///      Circuit breaker (brief 9.2): when `maxDeviationBps` is non-zero for a feed, the latest answer is compared
///      with the previous round (`roundId - 1`). A move above the bound reverts `PriceDeviation`.
///      Phase boundary (Chainlink proxy roundId = phaseId << 64 | aggregatorRoundId): the first round of a new
///      phase has no `roundId - 1` (getRoundData reverts or returns zero). In that case, and only then, the
///      answer is compared with the cached reference price (`lastAccepted`) instead. The reference is accepted
///      only if its own `updatedAt` is still within `maxStaleness`; otherwise `PreviousRoundUnavailable`
///      (fail closed). The reference is seeded by `setMaxDeviation` and refreshed by permissionless `poke`,
///      which stores only prices that passed every check. The breaker clears by itself when the next in-band
///      round lands (roundId - 1 then exists again), or when the governor changes the bound. Market reads the oracle only for risk-increasing
///      actions (borrow, collateral withdrawal) and for liquidation; repay and add-collateral never read it, so
///      they stay open while the breaker is tripped.
///      Closed-market policy: `maxStaleness` is the per-feed heartbeat. A feed may also carry an optional
///      `IMarketStatus` hook; when it reports closed (or reverts) the price fails closed (`MarketClosed`).
contract OracleAdapter is AccessControl {
    struct Feed {
        address aggregator;
        uint8 tokenDecimals;
        uint8 expectedPriceDecimals;
        uint32 maxStaleness;
        uint256 maxAnswer;
        bool enabled;
    }

    /// @dev 50% hard upper bound for the per-update deviation setting. Zero disables the breaker.
    uint16 public constant MAX_DEVIATION_BPS_LIMIT = 5_000;

    mapping(address asset => Feed feed) public feeds;
    /// @notice Per-feed max move between consecutive rounds, in basis points. Zero = breaker off.
    mapping(address asset => uint16 bps) public maxDeviationBps;
    /// @notice Optional per-feed market-hours hook. Zero = always open (24/7 asset).
    mapping(address asset => IMarketStatus hook) public marketStatus;

    struct Reference {
        uint128 price;
        uint64 updatedAt;
    }

    /// @notice Last price that passed every check, used only as the deviation reference at a phase boundary.
    mapping(address asset => Reference ref) public lastAccepted;

    event FeedSet(address indexed asset, address indexed aggregator, uint8 tokenDecimals, uint32 maxStaleness);
    event FeedDisabled(address indexed asset);
    event MaxDeviationSet(address indexed asset, uint16 bps);
    event MarketStatusSet(address indexed asset, address indexed hook);
    event ReferenceUpdated(address indexed asset, uint256 price, uint256 updatedAt);

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
    error PriceDeviation(address asset);
    error PreviousRoundUnavailable(address asset);
    error MarketClosed(address asset);

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
        emit FeedDisabled(asset);
    }

    /// @notice Set the per-update circuit breaker for `asset`. Zero disables it.
    function setMaxDeviation(address asset, uint16 bps) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (asset == address(0)) revert ZeroAddress();
        if (bps > MAX_DEVIATION_BPS_LIMIT) revert BadFeedConfig();
        maxDeviationBps[asset] = bps;
        emit MaxDeviationSet(asset, bps);
        // Seed the phase-boundary reference from the current (otherwise valid) answer. Governor-trusted.
        if (bps != 0 && feeds[asset].enabled) {
            (uint256 price,, uint256 updated,) = _readBase(asset);
            _storeReference(asset, price, updated);
        }
    }

    /// @notice Refresh the phase-boundary reference. Permissionless: stores only a price that passes `read`.
    function poke(address asset) external {
        (uint256 price,,, uint256 updated) = read(asset);
        if (updated > lastAccepted[asset].updatedAt) _storeReference(asset, price, updated);
    }

    /// @notice Install or clear the market-hours hook for `asset`.
    function setMarketStatus(address asset, IMarketStatus hook) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (asset == address(0)) revert ZeroAddress();
        marketStatus[asset] = hook;
        emit MarketStatusSet(asset, address(hook));
    }

    /// @notice Latest valid answer. Reverts when the feed is disabled, stale, non-positive, or incomplete.
    function read(address asset)
        public
        view
        returns (uint256 rawPrice, uint8 priceDecimals, uint8 tokenDecimals, uint256 updatedAt)
    {
        uint80 roundId;
        (rawPrice, roundId, updatedAt, priceDecimals) = _readBase(asset);
        tokenDecimals = feeds[asset].tokenDecimals;
        _checkDeviation(asset, feeds[asset], roundId, rawPrice);
        _checkOpen(asset);
    }

    /// @dev Every check except the breaker and market-hours hook.
    function _readBase(address asset)
        internal
        view
        returns (uint256 price, uint80 roundId, uint256 updated, uint8 liveDecimals)
    {
        Feed memory feed = feeds[asset];
        if (!feed.enabled || feed.aggregator == address(0)) revert FeedNotEnabled(asset);

        int256 answer;
        uint256 startedAt;
        uint80 answeredInRound;
        (roundId, answer, startedAt, updated, answeredInRound) = IAggregatorV3(feed.aggregator).latestRoundData();
        if (roundId == 0 || answeredInRound < roundId) revert IncompleteRound(asset);
        if (answer <= 0) revert InvalidPrice(asset);
        if (updated == 0 || updated > block.timestamp || startedAt > block.timestamp) revert InvalidTimestamp(asset);
        if (block.timestamp - updated > feed.maxStaleness) revert StalePrice(asset);

        price = uint256(answer);
        if (price > feed.maxAnswer) revert PriceOutOfBounds(asset);

        liveDecimals = IAggregatorV3(feed.aggregator).decimals();
        if (liveDecimals != feed.expectedPriceDecimals) revert DecimalsMismatch(asset);
    }

    function _storeReference(address asset, uint256 price, uint256 updated) internal {
        if (price > type(uint128).max || updated > type(uint64).max) revert PriceOutOfBounds(asset);
        lastAccepted[asset] = Reference(uint128(price), uint64(updated));
        emit ReferenceUpdated(asset, price, updated);
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

    function _checkDeviation(address asset, Feed memory feed, uint80 roundId, uint256 price) internal view {
        uint256 bps = maxDeviationBps[asset];
        if (bps == 0) return;
        uint256 prev = _previousAnswer(feed.aggregator, roundId);
        if (prev == 0) {
            // Phase boundary / first round: fall back to the cached reference, only while it is itself fresh.
            Reference memory ref = lastAccepted[asset];
            if (ref.price == 0 || block.timestamp - ref.updatedAt > feed.maxStaleness) {
                revert PreviousRoundUnavailable(asset);
            }
            prev = ref.price;
        }
        uint256 diff = price > prev ? price - prev : prev - price;
        // diff / prev > bps / 10_000, compared without division.
        if (Math.mulDiv(diff, 10_000, prev, Math.Rounding.Ceil) > bps) revert PriceDeviation(asset);
    }

    /// @dev Previous round's answer, or 0 when it is unavailable (first round, new phase, revert, invalid).
    function _previousAnswer(address aggregator, uint80 roundId) internal view returns (uint256) {
        // Low 64 bits = aggregator round inside the phase. 0 or 1 => roundId - 1 is not in this phase.
        if (uint64(roundId) < 2) return 0;
        try IAggregatorV3(aggregator).getRoundData(roundId - 1) returns (
            uint80, int256 prevAnswer, uint256, uint256 prevUpdated, uint80
        ) {
            if (prevAnswer <= 0 || prevUpdated == 0) return 0;
            return uint256(prevAnswer);
        } catch {
            return 0;
        }
    }

    function _checkOpen(address asset) internal view {
        IMarketStatus hook = marketStatus[asset];
        if (address(hook) == address(0)) return;
        try hook.isOpen(asset) returns (bool open) {
            if (!open) revert MarketClosed(asset);
        } catch {
            revert MarketClosed(asset);
        }
    }
}
