// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @title LiquidityHub
/// @notice Custodies ERC-20s for registered markets and enforces per-spoke credit lines.
/// @dev G2 buckets are per spoke and per asset. A spoke cannot draw another spoke's cash.
///      Shared cross-spoke liquidity (one supplier base, many spokes) is not enabled: interest
///      allocation across spokes is unspecified and is left for a later design.
///      There is no admin withdraw. Direct token transfers that skip `deposit` are not credited.
contract LiquidityHub is AccessControl {
    using SafeERC20 for IERC20;

    enum BucketKind {
        Liquidity,
        Collateral
    }

    mapping(address spoke => bool registered) public isSpoke;
    mapping(address asset => bool allowed) public assetAllowed;
    mapping(address spoke => mapping(address asset => mapping(BucketKind kind => uint256 amount))) public cashOf;
    mapping(address spoke => mapping(address asset => uint256 limit)) public creditLimit;
    mapping(address spoke => mapping(address asset => uint256 drawn)) public principalDrawn;

    event SpokeRegistered(address indexed spoke);
    event AssetAllowed(address indexed asset, bool allowed);
    event CreditLimitSet(address indexed spoke, address indexed asset, uint256 limit);
    event Deposited(address indexed spoke, address indexed asset, BucketKind kind, uint256 amount);
    event Withdrawn(address indexed spoke, address indexed asset, BucketKind kind, address indexed to, uint256 amount);
    event Drawn(address indexed spoke, address indexed asset, address indexed to, uint256 amount, uint256 drawnAfter);
    event Restored(address indexed spoke, address indexed asset, uint256 amount, uint256 drawnAfter);

    error ZeroAddress();
    error ZeroAmount();
    error NotSpoke();
    error AssetNotAllowed(address asset);
    error InsufficientCash();
    error CreditLineExceeded();
    error FeeOnTransferNotSupported();

    modifier onlySpoke() {
        if (!isSpoke[msg.sender]) revert NotSpoke();
        _;
    }

    constructor(address governor) {
        if (governor == address(0)) revert ZeroAddress();
        _grantRole(DEFAULT_ADMIN_ROLE, governor);
    }

    function registerSpoke(address spoke) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (spoke == address(0)) revert ZeroAddress();
        isSpoke[spoke] = true;
        emit SpokeRegistered(spoke);
    }

    function setAssetAllowed(address asset, bool allowed) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (asset == address(0)) revert ZeroAddress();
        assetAllowed[asset] = allowed;
        emit AssetAllowed(asset, allowed);
    }

    /// @notice Cap on outstanding principal (cash drawn and not yet restored) for a spoke and borrow asset.
    /// @dev Lowering the limit below the current drawn amount does not seize funds. New draws fail until repayments catch up.
    function setCreditLimit(address spoke, address asset, uint256 limit) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (spoke == address(0) || asset == address(0)) revert ZeroAddress();
        creditLimit[spoke][asset] = limit;
        emit CreditLimitSet(spoke, asset, limit);
    }

    /// @dev Pulls `amount` from the calling spoke. The spoke collects user tokens first, so a user
    ///      approves that market only. Another spoke cannot spend the approval.
    function deposit(address asset, BucketKind kind, uint256 amount) external onlySpoke returns (uint256 received) {
        if (!assetAllowed[asset]) revert AssetNotAllowed(asset);
        received = _pullExact(asset, msg.sender, amount);
        cashOf[msg.sender][asset][kind] += received;
        emit Deposited(msg.sender, asset, kind, received);
    }

    /// @notice Return supplier or collateral tokens. Allowed even when the asset is later delisted.
    function withdraw(address asset, BucketKind kind, address to, uint256 amount) external onlySpoke {
        if (amount == 0) revert ZeroAmount();
        uint256 bucket = cashOf[msg.sender][asset][kind];
        if (bucket < amount) revert InsufficientCash();
        cashOf[msg.sender][asset][kind] = bucket - amount;
        _pushExact(asset, to, amount);
        emit Withdrawn(msg.sender, asset, kind, to, amount);
    }

    /// @notice Send borrow-asset cash to a borrower and increase principal drawn. Checked against the credit line.
    function draw(address asset, address to, uint256 amount) external onlySpoke {
        if (!assetAllowed[asset]) revert AssetNotAllowed(asset);
        if (amount == 0) revert ZeroAmount();
        uint256 nextDrawn = principalDrawn[msg.sender][asset] + amount;
        if (nextDrawn > creditLimit[msg.sender][asset]) revert CreditLineExceeded();
        uint256 bucket = cashOf[msg.sender][asset][BucketKind.Liquidity];
        if (bucket < amount) revert InsufficientCash();
        cashOf[msg.sender][asset][BucketKind.Liquidity] = bucket - amount;
        principalDrawn[msg.sender][asset] = nextDrawn;
        _pushExact(asset, to, amount);
        emit Drawn(msg.sender, asset, to, amount, nextDrawn);
    }

    /// @notice Pull a repayment from the calling spoke into the liquidity bucket.
    /// @dev Principal drawn decreases by min(amount, drawn). Interest paid above principal stays as cash.
    ///      Repay remains possible after an asset is removed from the allowlist.
    function restore(address asset, uint256 amount) external onlySpoke returns (uint256 received) {
        received = _pullExact(asset, msg.sender, amount);
        cashOf[msg.sender][asset][BucketKind.Liquidity] += received;
        uint256 drawn = principalDrawn[msg.sender][asset];
        uint256 reduce = received > drawn ? drawn : received;
        principalDrawn[msg.sender][asset] = drawn - reduce;
        emit Restored(msg.sender, asset, received, principalDrawn[msg.sender][asset]);
    }

    function _pullExact(address asset, address from, uint256 amount) internal returns (uint256 received) {
        if (amount == 0) revert ZeroAmount();
        if (from == address(0)) revert ZeroAddress();
        uint256 beforeBal = IERC20(asset).balanceOf(address(this));
        IERC20(asset).safeTransferFrom(from, address(this), amount);
        uint256 afterBal = IERC20(asset).balanceOf(address(this));
        if (afterBal < beforeBal || afterBal - beforeBal != amount) revert FeeOnTransferNotSupported();
        received = amount;
    }

    function _pushExact(address asset, address to, uint256 amount) internal {
        if (to == address(0)) revert ZeroAddress();
        uint256 beforeBal = IERC20(asset).balanceOf(address(this));
        IERC20(asset).safeTransfer(to, amount);
        uint256 afterBal = IERC20(asset).balanceOf(address(this));
        if (beforeBal < afterBal || beforeBal - afterBal != amount) revert FeeOnTransferNotSupported();
    }
}
