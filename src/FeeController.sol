// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {Market} from "./Market.sol";
import {FixedPoint} from "./libraries/FixedPoint.sol";

/// @title FeeController
/// @notice Splits one market's reserve fee between the protocol reserve and the curator (brief 8.3).
/// @dev Install as the market's `feeRecipient`. Source: the market's reserve factor `f` mints supply shares to
///      this contract on accrual (unit: market supply shares, valued at the supply index). On `distribute`,
///      newly received shares are split: curator gets `floor(new * curatorShareWad / WAD)`, the protocol gets the
///      rest, so rounding dust always goes to the protocol reserve. Destinations: `curatorRecipient` and
///      `protocolRecipient`, paid in the borrow asset by withdrawing from the market on `claim*`.
///      Ledgers never exceed shares held (`protocolShares + curatorShares == market.supplyShares(this)` after
///      `distribute`), so no unbacked liability is created. Liquidation bonus is not routed here; it is paid to
///      the liquidator inside `Market.liquidate`. There is no FHE/relayer cost in PUBLIC mode.
///      Admin is the curator timelock, so split and recipient changes are delayed (CuratorRegistry queue*).
///      `curatorShareWad` is hard-capped at `MAX_CURATOR_SHARE_WAD` of the reserve fee.
contract FeeController is AccessControl, ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 public constant MAX_CURATOR_SHARE_WAD = 0.5e18;

    Market public immutable market;
    IERC20 public immutable asset;

    address public protocolRecipient;
    address public curatorRecipient;
    uint256 public curatorShareWad;
    uint256 public protocolShares;
    uint256 public curatorShares;

    event FeesDistributed(uint256 newShares, uint256 toProtocol, uint256 toCurator);
    event FeesClaimed(address indexed recipient, bool indexed curator, uint256 assets, uint256 sharesBurned);
    event CuratorShareUpdated(uint256 curatorShareWad);
    event RecipientsUpdated(address indexed protocolRecipient, address indexed curatorRecipient);

    error ZeroAddress();
    error BadCuratorShare();
    error NothingToClaim();
    error ShareAccountingMismatch();

    constructor(Market market_, address admin, address protocolRecipient_, address curatorRecipient_, uint256 share) {
        if (
            address(market_) == address(0) || admin == address(0) || protocolRecipient_ == address(0)
                || curatorRecipient_ == address(0)
        ) revert ZeroAddress();
        if (share > MAX_CURATOR_SHARE_WAD) revert BadCuratorShare();
        market = market_;
        asset = IERC20(market_.borrowAsset());
        protocolRecipient = protocolRecipient_;
        curatorRecipient = curatorRecipient_;
        curatorShareWad = share;
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        emit CuratorShareUpdated(share);
        emit RecipientsUpdated(protocolRecipient_, curatorRecipient_);
    }

    /// @notice Accrue the market and assign shares received since the last call. Permissionless.
    function distribute() public nonReentrant {
        _distribute();
    }

    /// @notice Withdraw up to `assets` of the protocol ledger to `protocolRecipient`. `type(uint256).max` = all.
    function claimProtocol(uint256 assets) external nonReentrant returns (uint256) {
        return _claim(false, assets);
    }

    /// @notice Withdraw up to `assets` of the curator ledger to `curatorRecipient`. `type(uint256).max` = all.
    function claimCurator(uint256 assets) external nonReentrant returns (uint256) {
        return _claim(true, assets);
    }

    /// @notice Timelocked. Distributes at the old split first so past fees keep their split.
    function setCuratorShare(uint256 share) external onlyRole(DEFAULT_ADMIN_ROLE) nonReentrant {
        if (share > MAX_CURATOR_SHARE_WAD) revert BadCuratorShare();
        _distribute();
        curatorShareWad = share;
        emit CuratorShareUpdated(share);
    }

    /// @notice Timelocked. Existing ledgers follow the new recipients.
    function setRecipients(address protocolRecipient_, address curatorRecipient_)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        if (protocolRecipient_ == address(0) || curatorRecipient_ == address(0)) {
            revert ZeroAddress();
        }
        protocolRecipient = protocolRecipient_;
        curatorRecipient = curatorRecipient_;
        emit RecipientsUpdated(protocolRecipient_, curatorRecipient_);
    }

    /// @notice Claimable borrow-asset amount (floored) for each ledger, excluding undistributed shares.
    function claimable() external view returns (uint256 protocolAssets, uint256 curatorAssets) {
        uint256 index = market.supplyIndex();
        protocolAssets = Math.mulDiv(protocolShares, index, FixedPoint.RAY, Math.Rounding.Floor);
        curatorAssets = Math.mulDiv(curatorShares, index, FixedPoint.RAY, Math.Rounding.Floor);
    }

    function _distribute() internal {
        market.accrue();
        uint256 held = market.supplyShares(address(this));
        uint256 accounted = protocolShares + curatorShares;
        if (held < accounted) revert ShareAccountingMismatch();
        uint256 fresh = held - accounted;
        if (fresh == 0) return;
        uint256 toCurator = Math.mulDiv(fresh, curatorShareWad, FixedPoint.WAD, Math.Rounding.Floor);
        uint256 toProtocol = fresh - toCurator;
        curatorShares += toCurator;
        protocolShares += toProtocol;
        emit FeesDistributed(fresh, toProtocol, toCurator);
    }

    function _claim(bool curator, uint256 assets) internal returns (uint256) {
        _distribute();
        uint256 ledger = curator ? curatorShares : protocolShares;
        uint256 maxAssets = Math.mulDiv(ledger, market.supplyIndex(), FixedPoint.RAY, Math.Rounding.Floor);
        if (assets > maxAssets) assets = maxAssets;
        if (assets == 0) revert NothingToClaim();

        uint256 heldBefore = market.supplyShares(address(this));
        market.withdraw(assets);
        uint256 heldAfter = market.supplyShares(address(this));
        if (heldAfter > heldBefore) revert ShareAccountingMismatch();
        uint256 burned = heldBefore - heldAfter;
        if (burned > ledger) revert ShareAccountingMismatch();
        address to;
        if (curator) {
            curatorShares = ledger - burned;
            to = curatorRecipient;
        } else {
            protocolShares = ledger - burned;
            to = protocolRecipient;
        }
        asset.safeTransfer(to, assets);
        emit FeesClaimed(to, curator, assets, burned);
        return assets;
    }
}
