// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {IAggregatorV3} from "./interfaces/IAggregatorV3.sol";
import {IERC8056} from "./interfaces/IERC8056.sol";
import {IMarketStatus} from "./interfaces/IMarketStatus.sol";
import {OracleAdapter} from "./OracleAdapter.sol";

/// @title AssayRegistry (ASSAY)
/// @notice Corporate-action classifier for stock collateral (brief v3 §8.1).
///         A small `uiMultiplier` uplift is a DIVIDEND: it never pauses the market and compounds `dividendIndex`.
///         A split, reverse split, or large move is a CORP_ACTION: borrow, collateral withdrawal and liquidation
///         pause (via `OracleAdapter.setMarketStatus`) until the feed has repriced and passes a sanity check.
///         A small unexplained decrease, or a failed sanity check, is UNEXPLAINED and only the Safe can reopen it.
/// @dev Also the `IMarketStatus` hook (the "AssayStatus" role in the brief). `OracleAdapter` already treats a
///      false or reverting hook as closed, and repay / addCollateral / supply / withdraw never read the oracle,
///      so ASSAY cannot block them. `record` reads the Chainlink aggregator directly, never `OracleAdapter.read`,
///      because `read` calls this hook (no recursion).
contract AssayRegistry is AccessControl, IMarketStatus {
    /// @notice Held by the 48h TimelockController. Required to loosen parameters.
    bytes32 public constant PARAMS_ROLE = keccak256("PARAMS_ROLE");

    uint256 internal constant WAD = 1e18;
    uint256 internal constant BPS = 10_000;

    enum State {
        NORMAL,
        CORP_ACTION_PENDING,
        CORP_ACTION_ACTIVE,
        UNEXPLAINED,
        ISSUER_PAUSED
    }

    enum Class {
        DIVIDEND,
        CORP_ACTION,
        UNEXPLAINED
    }

    struct Params {
        uint16 maxDividendStepBps;
        uint16 minDecreaseToleranceBps;
        uint32 preEventWindow;
        uint32 postEventSettle;
        uint16 maxPostEventValueDeviationBps;
    }

    struct Asset {
        bool registered;
        State state; // stored state: NORMAL, CORP_ACTION_ACTIVE or UNEXPLAINED
        uint64 eventId;
        uint64 since;
        uint64 eventEffectiveAt;
        uint64 scheduledEffectiveAt; // last CORP_ACTION schedule already announced
        uint256 lastMultiplier;
        uint256 dividendIndex;
        uint256 priceBefore;
        uint128 snapPrice; // last fresh feed price seen by `record` while NORMAL
        uint64 snapUpdatedAt;
    }

    struct Entry {
        uint64 eventId;
        Class class;
        uint256 mPrev;
        uint256 mNow;
        uint256 dividendIndex;
        uint64 effectiveAt;
        uint64 recordedAt;
        uint64 blockNumber;
    }

    struct StatusView {
        State state;
        uint64 eventId;
        uint64 since;
        uint64 reopensNoEarlierThan;
    }

    OracleAdapter public immutable oracle;

    mapping(address asset => Asset) internal _assets;
    mapping(address asset => Params) public params;
    mapping(address asset => Entry[]) internal _history;
    mapping(address asset => mapping(uint64 eventId => uint256)) public dividendIndexAt;

    event AssetRegistered(address indexed asset, uint256 baselineMultiplier);
    event DividendReinvested(
        address indexed asset,
        uint256 mPrev,
        uint256 mNow,
        uint256 ratioWad,
        uint256 dividendIndex,
        uint256 effectiveAt,
        uint256 recordedAt
    );
    event CorporateActionScheduled(address indexed asset, uint256 mNow, uint256 mNew, uint256 effectiveAt);
    event CorporateActionDetected(
        address indexed asset, uint256 indexed eventId, uint256 mPrev, uint256 mNow, uint256 effectiveAt
    );
    event CorporateActionSettled(
        address indexed asset, uint256 indexed eventId, uint256 priceBefore, uint256 priceAfter
    );
    event UnexplainedChange(address indexed asset, uint256 indexed eventId, uint256 mPrev, uint256 mNow);
    event Resolved(
        address indexed asset, uint256 indexed eventId, uint8 classification, uint256 dividendComponentWad, bytes32 reasonHash
    );
    event AssayParamsUpdated(
        address indexed asset,
        uint16 maxDividendStepBps,
        uint16 minDecreaseToleranceBps,
        uint32 preEventWindow,
        uint32 postEventSettle,
        uint16 maxPostEventValueDeviationBps
    );

    error ZeroAddress();
    error AlreadyRegistered(address asset);
    error NotRegistered(address asset);
    error BadParams();
    error LooseningNeedsTimelock();
    error NothingToResolve(address asset);
    error WrongEvent(uint64 expected, uint64 given);
    error MissingReason();
    error BadDividendComponent();

    constructor(address admin, address timelock, OracleAdapter oracle_) {
        if (admin == address(0) || timelock == address(0) || address(oracle_) == address(0)) revert ZeroAddress();
        oracle = oracle_;
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(PARAMS_ROLE, timelock);
    }

    // ------------------------------------------------------------------ admin

    function defaultParams() public pure returns (Params memory) {
        return Params({
            maxDividendStepBps: 100,
            minDecreaseToleranceBps: 50,
            preEventWindow: 3_600,
            postEventSettle: 7_200,
            maxPostEventValueDeviationBps: 1_500
        });
    }

    /// @notice Start tracking `asset`. `baselineMultiplier` is the multiplier the index counts from
    ///         (1e18 = since token launch); the first `record` classifies baseline → current.
    function register(address asset, uint256 baselineMultiplier) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (asset == address(0) || baselineMultiplier == 0) revert ZeroAddress();
        Asset storage a = _assets[asset];
        if (a.registered) revert AlreadyRegistered(asset);
        a.registered = true;
        a.lastMultiplier = baselineMultiplier;
        a.dividendIndex = WAD;
        a.since = uint64(block.timestamp);
        _setParams(asset, defaultParams());
        emit AssetRegistered(asset, baselineMultiplier);
    }

    /// @notice Timelock may set anything inside hard bounds; the Safe may only tighten.
    function setParams(address asset, Params calldata p) external {
        if (!_assets[asset].registered) revert NotRegistered(asset);
        if (!hasRole(PARAMS_ROLE, msg.sender)) {
            _checkRole(DEFAULT_ADMIN_ROLE);
            Params memory c = params[asset];
            if (
                p.maxDividendStepBps > c.maxDividendStepBps || p.minDecreaseToleranceBps < c.minDecreaseToleranceBps
                    || p.preEventWindow < c.preEventWindow || p.postEventSettle < c.postEventSettle
                    || p.maxPostEventValueDeviationBps > c.maxPostEventValueDeviationBps
            ) revert LooseningNeedsTimelock();
        }
        _setParams(asset, p);
    }

    function _setParams(address asset, Params memory p) internal {
        if (
            p.maxDividendStepBps < 10 || p.maxDividendStepBps > 300 || p.minDecreaseToleranceBps > 200
                || p.preEventWindow > 86_400 || p.postEventSettle < 1_800 || p.postEventSettle > 604_800
                || p.maxPostEventValueDeviationBps < 300 || p.maxPostEventValueDeviationBps > 5_000
        ) revert BadParams();
        params[asset] = p;
        emit AssayParamsUpdated(
            asset,
            p.maxDividendStepBps,
            p.minDecreaseToleranceBps,
            p.preEventWindow,
            p.postEventSettle,
            p.maxPostEventValueDeviationBps
        );
    }

    /// @notice Safe override for an open CORP_ACTION or UNEXPLAINED event. Optionally credits a verified dividend
    ///         component (ratio in WAD, e.g. 1.0013e18) of a mixed split+dividend event. `reasonHash` is required.
    function resolve(address asset, uint64 eventId, Class classification, uint256 dividendComponentWad, bytes32 reasonHash)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        Asset storage a = _assets[asset];
        if (!a.registered) revert NotRegistered(asset);
        if (a.state == State.NORMAL) revert NothingToResolve(asset);
        if (eventId != a.eventId) revert WrongEvent(a.eventId, eventId);
        if (reasonHash == bytes32(0)) revert MissingReason();
        if (dividendComponentWad != 0) {
            if (dividendComponentWad <= WAD || !_inDividendBand(WAD, dividendComponentWad, params[asset])) {
                revert BadDividendComponent();
            }
            a.dividendIndex = Math.mulDiv(a.dividendIndex, dividendComponentWad, WAD);
            dividendIndexAt[asset][eventId] = a.dividendIndex;
        }
        a.state = State.NORMAL;
        a.since = uint64(block.timestamp);
        a.priceBefore = 0;
        emit Resolved(asset, eventId, uint8(classification), dividendComponentWad, reasonHash);
    }

    // ------------------------------------------------------------ permissionless

    /// @notice Classify any multiplier change since the last call, announce schedules, and try to settle.
    function record(address asset) public {
        Asset storage a = _assets[asset];
        if (!a.registered) revert NotRegistered(asset);
        Params memory p = params[asset];
        IERC8056 t = IERC8056(asset);

        uint256 mPrev = a.lastMultiplier;
        uint256 mNow = t.uiMultiplier();
        uint256 eff = t.effectiveAt();

        if (mNow != mPrev) {
            bool paused = t.oraclePaused();
            Class c = _classify(mPrev, mNow, p);
            if (c == Class.DIVIDEND && (paused || a.state != State.NORMAL)) c = Class.CORP_ACTION;
            uint64 id = ++a.eventId;

            if (c == Class.DIVIDEND) {
                uint256 r = Math.mulDiv(mNow, WAD, mPrev);
                a.dividendIndex = Math.mulDiv(a.dividendIndex, r, WAD);
                emit DividendReinvested(asset, mPrev, mNow, r, a.dividendIndex, eff, block.timestamp);
            } else if (c == Class.CORP_ACTION) {
                if (a.state == State.NORMAL) {
                    a.priceBefore = _priceBefore(asset, a, eff);
                    a.state = State.CORP_ACTION_ACTIVE;
                    a.since = uint64(block.timestamp);
                }
                // UNEXPLAINED stays UNEXPLAINED; an already-active event keeps its original priceBefore.
                a.eventEffectiveAt = uint64(eff);
                emit CorporateActionDetected(asset, id, mPrev, mNow, eff);
            } else {
                a.state = State.UNEXPLAINED;
                a.since = uint64(block.timestamp);
                emit UnexplainedChange(asset, id, mPrev, mNow);
            }
            dividendIndexAt[asset][id] = a.dividendIndex;
            a.lastMultiplier = mNow;
            _history[asset].push(
                Entry(id, c, mPrev, mNow, a.dividendIndex, uint64(eff), uint64(block.timestamp), uint64(block.number))
            );
        }

        // Pending schedule (before effectiveAt): announce a CORP_ACTION once; dividends need no action.
        uint256 mNew = t.newUIMultiplier();
        if (mNew != 0 && mNew != mNow && eff > block.timestamp && eff != a.scheduledEffectiveAt) {
            if (_classify(mNow, mNew, p) != Class.DIVIDEND) {
                a.scheduledEffectiveAt = uint64(eff);
                emit CorporateActionScheduled(asset, mNow, mNew, eff);
            }
        }

        if (a.state == State.CORP_ACTION_ACTIVE) _trySettle(asset, a, p);
        else if (a.state == State.NORMAL) _snapshot(asset, a);
    }

    function settle(address asset) external {
        record(asset);
    }

    // -------------------------------------------------------------------- views

    /// @inheritdoc IMarketStatus
    /// @dev Reverting token calls bubble up; OracleAdapter treats a revert as closed.
    function isOpen(address asset) external view returns (bool) {
        Asset storage a = _assets[asset];
        if (!a.registered) return false;
        IERC8056 t = IERC8056(asset);
        if (t.oraclePaused()) return false;
        State s = a.state;
        if (s != State.NORMAL) return false;
        Params memory p = params[asset];
        uint256 mNow = t.uiMultiplier();
        uint256 mPrev = a.lastMultiplier;
        // Unrecorded change: only an in-band dividend is allowed through before the keeper records it.
        if (mNow != mPrev && _classify(mPrev, mNow, p) != Class.DIVIDEND) return false;
        return !_pendingClosed(t, mNow, p);
    }

    function status(address asset) external view returns (StatusView memory v) {
        Asset storage a = _assets[asset];
        if (!a.registered) revert NotRegistered(asset);
        v.eventId = a.eventId;
        v.since = a.since;
        IERC8056 t = IERC8056(asset);
        Params memory p = params[asset];
        if (a.state == State.CORP_ACTION_ACTIVE) {
            v.state = State.CORP_ACTION_ACTIVE;
            uint256 start = Math.max(a.eventEffectiveAt, a.since);
            v.reopensNoEarlierThan = uint64(start + p.postEventSettle);
        } else if (a.state == State.UNEXPLAINED) {
            v.state = State.UNEXPLAINED;
        } else if (t.oraclePaused()) {
            v.state = State.ISSUER_PAUSED;
        } else {
            uint256 mNow = t.uiMultiplier();
            if (mNow != a.lastMultiplier && _classify(a.lastMultiplier, mNow, p) != Class.DIVIDEND) {
                v.state = State.CORP_ACTION_ACTIVE; // live-detected, not yet recorded
            } else if (_pendingScheduled(t, mNow, p)) {
                v.state = State.CORP_ACTION_PENDING;
                v.reopensNoEarlierThan = uint64(t.effectiveAt() + p.postEventSettle);
            }
        }
    }

    function dividendIndex(address asset) external view returns (uint256) {
        return _assets[asset].dividendIndex;
    }

    function lastMultiplier(address asset) external view returns (uint256) {
        return _assets[asset].lastMultiplier;
    }

    function isRegistered(address asset) external view returns (bool) {
        return _assets[asset].registered;
    }

    function historyLength(address asset) external view returns (uint256) {
        return _history[asset].length;
    }

    /// @notice History entries in [from, to) by array index.
    function history(address asset, uint256 from, uint256 to) external view returns (Entry[] memory out) {
        Entry[] storage h = _history[asset];
        if (to > h.length) to = h.length;
        if (from >= to) return out;
        out = new Entry[](to - from);
        for (uint256 i = from; i < to; ++i) {
            out[i - from] = h[i];
        }
    }

    // ----------------------------------------------------------------- internal

    function _inDividendBand(uint256 mPrev, uint256 mNow, Params memory p) internal pure returns (bool) {
        return mNow > mPrev && mNow * BPS <= mPrev * (BPS + p.maxDividendStepBps);
    }

    function _classify(uint256 mPrev, uint256 mNow, Params memory p) internal pure returns (Class) {
        if (_inDividendBand(mPrev, mNow, p)) return Class.DIVIDEND;
        // Small decrease (within tolerance) has no legitimate reason → UNEXPLAINED. Larger moves either way → CORP_ACTION.
        if (mNow < mPrev && mNow * BPS >= mPrev * (BPS - p.minDecreaseToleranceBps)) return Class.UNEXPLAINED;
        return Class.CORP_ACTION;
    }

    function _pendingScheduled(IERC8056 t, uint256 mNow, Params memory p) internal view returns (bool) {
        uint256 eff = t.effectiveAt();
        if (eff <= block.timestamp) return false;
        uint256 mNew = t.newUIMultiplier();
        if (mNew == 0 || mNew == mNow) return false;
        return _classify(mNow, mNew, p) != Class.DIVIDEND;
    }

    function _pendingClosed(IERC8056 t, uint256 mNow, Params memory p) internal view returns (bool) {
        if (!_pendingScheduled(t, mNow, p)) return false;
        uint256 eff = t.effectiveAt();
        return block.timestamp + p.preEventWindow >= eff;
    }

    function _latest(address asset) internal view returns (uint256 price, uint256 updatedAt, uint32 maxStaleness) {
        (address agg,,, uint32 staleness,, bool enabled) = oracle.feeds(asset);
        if (!enabled || agg == address(0)) return (0, 0, staleness);
        try IAggregatorV3(agg).latestRoundData() returns (uint80, int256 answer, uint256, uint256 upd, uint80) {
            if (answer <= 0 || upd == 0 || upd > block.timestamp) return (0, 0, staleness);
            return (uint256(answer), upd, staleness);
        } catch {
            return (0, 0, staleness);
        }
    }

    function _snapshot(address asset, Asset storage a) internal {
        (uint256 price, uint256 upd, uint32 staleness) = _latest(asset);
        if (price != 0 && block.timestamp - upd <= staleness && price <= type(uint128).max) {
            a.snapPrice = uint128(price);
            a.snapUpdatedAt = uint64(upd);
        }
    }

    /// @dev Last fresh pre-event price: the live answer if it predates effectiveAt, else the snapshot. 0 = unknown.
    function _priceBefore(address asset, Asset storage a, uint256 eff) internal view returns (uint256) {
        (uint256 price, uint256 upd, uint32 staleness) = _latest(asset);
        if (price != 0 && upd <= eff && block.timestamp - upd <= staleness) return price;
        if (a.snapPrice != 0 && a.snapUpdatedAt <= eff) return a.snapPrice;
        return 0;
    }

    function _trySettle(address asset, Asset storage a, Params memory p) internal {
        if (IERC8056(asset).oraclePaused()) return;
        uint256 start = Math.max(a.eventEffectiveAt, a.since);
        if (block.timestamp < start + p.postEventSettle) return;
        (uint256 priceAfter, uint256 upd, uint32 staleness) = _latest(asset);
        if (priceAfter == 0 || block.timestamp - upd > staleness || upd <= a.eventEffectiveAt) return;

        uint256 before = a.priceBefore;
        uint256 id = a.eventId;
        bool sane;
        if (before != 0) {
            uint256 diff = priceAfter > before ? priceAfter - before : before - priceAfter;
            sane = Math.mulDiv(diff, BPS, before, Math.Rounding.Ceil) <= p.maxPostEventValueDeviationBps;
        }
        if (sane) {
            a.state = State.NORMAL;
            a.since = uint64(block.timestamp);
            a.priceBefore = 0;
            emit CorporateActionSettled(asset, id, before, priceAfter);
            _snapshot(asset, a);
        } else {
            a.state = State.UNEXPLAINED;
            a.since = uint64(block.timestamp);
            emit UnexplainedChange(asset, id, a.lastMultiplier, a.lastMultiplier);
        }
    }
}
