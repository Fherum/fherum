// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {EmergencyController} from "./EmergencyController.sol";
import {InterestRateModel} from "./InterestRateModel.sol";
import {LiquidationEngine} from "./LiquidationEngine.sol";
import {LiquidityHub} from "./LiquidityHub.sol";
import {OracleAdapter} from "./OracleAdapter.sol";
import {PositionManager} from "./PositionManager.sol";
import {RiskEngine} from "./RiskEngine.sol";
import {IEligibilityAdapter} from "./interfaces/IEligibilityAdapter.sol";
import {IFHEAdapter} from "./interfaces/IFHEAdapter.sol";
import {Caps} from "./libraries/Caps.sol";
import {FixedPoint} from "./libraries/FixedPoint.sol";
import {Math512} from "./libraries/Math512.sol";
import {ReserveAccounting} from "./libraries/ReserveAccounting.sol";
import {PrivacyMode} from "./types/PrivacyMode.sol";

// Entry points use ReentrancyGuard. PositionManager accepts only this market and does not call back.
// Accounting writes follow external views of positions, oracles, and hub cash. See docs/STATIC-ANALYSIS.md.
// slither-disable-start reentrancy-no-eth
/// @title Market
/// @notice One curated spoke: suppliers fund a borrow asset, borrowers post a different collateral asset.
/// @dev privacyMode is Public and there is no setter. Position amounts are public integers routed through
///      PlaintextFHEAdapter. Confidential mode is not implemented.
///      Not an Aave market and not an Aave fork. Hub-and-spoke here means one hub custody contract plus
///      per-market reserves. Cross-spoke fungibility is intentionally off in G2.
contract Market is AccessControl, ReentrancyGuard {
    using SafeERC20 for IERC20;

    bytes32 public constant CURATOR_ROLE = keccak256("CURATOR_ROLE");

    uint256 internal constant MAX_LT_WAD = 0.95e18;
    uint256 internal constant MAX_BONUS_WAD = 1.15e18;
    uint256 internal constant MIN_BONUS_WAD = 1e18;
    uint256 internal constant MIN_CLOSE_WAD = 0.01e18;
    uint256 internal constant MAX_RESERVE_FACTOR_WAD = 0.5e18;
    uint256 internal constant MAX_DUST_WAD = 1000e18;

    struct MarketConfig {
        address governor;
        address curator;
        address feeRecipient;
        LiquidityHub hub;
        address collateralAsset;
        address borrowAsset;
        OracleAdapter oracle;
        InterestRateModel interestRateModel;
        EmergencyController emergency;
        IFHEAdapter fhe;
        RiskEngine risk;
        LiquidationEngine liquidationEngine;
        uint256 ltvWad;
        uint256 liquidationThresholdWad;
        uint256 liquidationBonusWad;
        uint256 closeFactorWad;
        uint256 reserveFactorWad;
        uint256 dustValueWad;
        uint256 supplyCap;
        uint256 borrowCap;
        uint256 walletSupplyCap;
        uint256 walletBorrowCap;
        uint256 baseRateWad;
        uint256 slope1Wad;
        uint256 slope2Wad;
        uint256 optimalUtilWad;
        /// @dev Zero leaves supply and borrow open to every address. Factory markets may set a gate here.
        IEligibilityAdapter eligibility;
    }

    LiquidityHub public immutable hub;
    address public immutable collateralAsset;
    address public immutable borrowAsset;
    OracleAdapter public immutable oracle;
    InterestRateModel public immutable interestRateModel;
    EmergencyController public immutable emergency;
    IFHEAdapter public immutable fhe;
    RiskEngine public immutable risk;
    LiquidationEngine public immutable liquidationEngine;
    PositionManager public immutable positions;
    /// @notice Governor and curator granted at construction. MarketFactory checks these before registering.
    address public immutable initialGovernor;
    address public immutable initialCurator;

    address public feeRecipient;
    uint256 public ltvWad;
    uint256 public liquidationThresholdWad;
    uint256 public liquidationBonusWad;
    uint256 public closeFactorWad;
    uint256 public reserveFactorWad;
    uint256 public dustValueWad;
    uint256 public totalCollateral;
    /// @dev Fee shares already included in `reserve.totalSupplyShares` but not yet written onto the fee recipient.
    ///      Flushed to zero before each state-changing call returns.
    uint256 public pendingFeeShares;
    Caps.Limits public caps;
    InterestRateModel.RateParams public rateParams;
    ReserveAccounting.Reserve public reserve;
    /// @notice Optional supply/borrow gate. The zero address means the gate is off.
    IEligibilityAdapter public eligibility;

    event Supplied(address indexed user, uint256 assets, uint256 shares);
    event Withdrawn(address indexed user, uint256 assets, uint256 shares);
    event CollateralAdded(address indexed user, uint256 assets);
    event CollateralRemoved(address indexed user, uint256 assets);
    event Borrowed(address indexed user, uint256 assets, uint256 sharesMinted);
    event Repaid(address indexed user, address indexed payer, uint256 assets, uint256 sharesBurned);
    event Liquidated(address indexed borrower, address indexed liquidator, uint256 repayAssets, uint256 seizeAssets);
    event Accrued(uint256 supplyIndex, uint256 borrowIndex, uint256 interestAssets, uint256 feeShares);
    event RiskParamsUpdated(
        uint256 ltvWad,
        uint256 liquidationThresholdWad,
        uint256 liquidationBonusWad,
        uint256 closeFactorWad,
        uint256 reserveFactorWad,
        uint256 dustValueWad
    );
    event CapsUpdated(uint256 supplyCap, uint256 borrowCap, uint256 walletSupplyCap, uint256 walletBorrowCap);
    event RateParamsUpdated(uint256 baseRateWad, uint256 slope1Wad, uint256 slope2Wad, uint256 optimalUtilWad);
    event FeeRecipientUpdated(address indexed feeRecipient);
    event EligibilityUpdated(address indexed eligibility);
    /// @dev Emitted once at construction. `mode` is PrivacyMode.Public (0). Label is the public posture, not a ciphertext claim.
    event PrivacyModeDeclared(uint8 mode, string label);

    error ZeroAddress();
    error ZeroAmount();
    error AssetsMustDiffer();
    error MarketPaused();
    error InsufficientLiquidity();
    error NoDebt();
    error RepayTooSmall();
    error BorrowRounding();
    error WithdrawInsolvent();
    error LtvExceeded();
    error Unhealthy();
    error NotLiquidatable();
    error SelfLiquidation();
    error BonusExceeded();
    error ShareAccountingMismatch();
    error LtvAboveThreshold();
    error BadLiquidationThreshold();
    error BadBonus();
    error BadCloseFactor();
    error BadReserveFactor();
    error BadDust();
    error FeeOnTransferNotSupported();
    error NotEligible();

    /// @dev Blocks borrow, collateral withdrawal, and liquidation while the risk pause is on.
    ///      Repay does not use this modifier. Supply and borrow-asset withdrawal do not either.
    ///      EmergencyController.repayPaused is always false. There is no repay pause bit.
    modifier whenRiskAllowed() {
        if (emergency.paused(address(this))) revert MarketPaused();
        _;
    }

    constructor(MarketConfig memory cfg) {
        if (
            cfg.governor == address(0) || cfg.curator == address(0) || cfg.feeRecipient == address(0)
                || address(cfg.hub) == address(0) || cfg.collateralAsset == address(0) || cfg.borrowAsset == address(0)
                || address(cfg.oracle) == address(0) || address(cfg.interestRateModel) == address(0)
                || address(cfg.emergency) == address(0) || address(cfg.fhe) == address(0) || address(cfg.risk) == address(0)
                || address(cfg.liquidationEngine) == address(0)
        ) revert ZeroAddress();
        if (cfg.collateralAsset == cfg.borrowAsset) revert AssetsMustDiffer();

        hub = cfg.hub;
        collateralAsset = cfg.collateralAsset;
        borrowAsset = cfg.borrowAsset;
        oracle = cfg.oracle;
        interestRateModel = cfg.interestRateModel;
        emergency = cfg.emergency;
        fhe = cfg.fhe;
        risk = cfg.risk;
        liquidationEngine = cfg.liquidationEngine;
        feeRecipient = cfg.feeRecipient;
        initialGovernor = cfg.governor;
        initialCurator = cfg.curator;
        positions = new PositionManager(cfg.fhe, address(this));

        _grantRole(DEFAULT_ADMIN_ROLE, cfg.governor);
        _grantRole(CURATOR_ROLE, cfg.governor);
        _grantRole(CURATOR_ROLE, cfg.curator);

        _setRisk(
            cfg.ltvWad,
            cfg.liquidationThresholdWad,
            cfg.liquidationBonusWad,
            cfg.closeFactorWad,
            cfg.reserveFactorWad,
            cfg.dustValueWad
        );
        _setCaps(cfg.supplyCap, cfg.borrowCap, cfg.walletSupplyCap, cfg.walletBorrowCap);
        _setRates(cfg.baseRateWad, cfg.slope1Wad, cfg.slope2Wad, cfg.optimalUtilWad);

        reserve.supplyIndex = FixedPoint.RAY;
        reserve.borrowIndex = FixedPoint.RAY;
        if (block.timestamp > type(uint40).max) revert BadDust();
        reserve.lastAccrual = uint40(block.timestamp);

        eligibility = cfg.eligibility;
        emit EligibilityUpdated(address(cfg.eligibility));
        emit PrivacyModeDeclared(uint8(PrivacyMode.Public), "public");
    }

    modifier accrued() {
        _accrue();
        _;
        _flushFees();
    }

    /// @notice Always Public. Confidential is not selectable in this contract.
    function privacyMode() external pure returns (PrivacyMode) {
        return PrivacyMode.Public;
    }

    function accrue() external nonReentrant accrued {}

    function supply(uint256 assets) external nonReentrant accrued {
        if (assets < 1) revert ZeroAmount();
        _requireEligible(msg.sender);
        uint256 shares = Math.mulDiv(assets, FixedPoint.RAY, reserve.supplyIndex, Math.Rounding.Floor);
        if (shares < 1) revert ZeroAmount();
        reserve.totalSupplyShares += shares;
        uint256 newUserShares = positions.addSupplyShares(msg.sender, shares);
        if (newUserShares < shares) revert ShareAccountingMismatch();
        Caps.checkSupply(
            caps,
            ReserveAccounting.supplyAssets(reserve.totalSupplyShares, reserve.supplyIndex),
            ReserveAccounting.supplyAssets(newUserShares, reserve.supplyIndex)
        );
        uint256 received = _takeAndDeposit(borrowAsset, LiquidityHub.BucketKind.Liquidity, msg.sender, assets);
        if (received < assets) revert FeeOnTransferNotSupported();
        emit Supplied(msg.sender, received, shares);
    }

    function withdraw(uint256 assets) external nonReentrant accrued {
        if (assets < 1) revert ZeroAmount();
        uint256 shares = positions.supplyShares(msg.sender);
        uint256 userAssets = ReserveAccounting.supplyAssets(shares, reserve.supplyIndex);
        if (assets > userAssets) revert InsufficientLiquidity();
        if (assets > _available()) revert InsufficientLiquidity();

        uint256 sharesBurn = Math.mulDiv(assets, FixedPoint.RAY, reserve.supplyIndex, Math.Rounding.Ceil);
        if (sharesBurn < 1 || sharesBurn > shares) revert InsufficientLiquidity();

        uint256 supplyBefore = ReserveAccounting.supplyAssets(reserve.totalSupplyShares, reserve.supplyIndex);
        reserve.totalSupplyShares -= sharesBurn;
        uint256 updated = positions.subSupplyShares(msg.sender, sharesBurn);
        if (updated > shares || updated + sharesBurn < shares || updated + sharesBurn > shares) {
            revert ShareAccountingMismatch();
        }
        uint256 supplyAfter = ReserveAccounting.supplyAssets(reserve.totalSupplyShares, reserve.supplyIndex);
        if (supplyBefore < supplyAfter || supplyBefore - supplyAfter < assets) revert WithdrawInsolvent();

        hub.withdraw(borrowAsset, LiquidityHub.BucketKind.Liquidity, msg.sender, assets);
        emit Withdrawn(msg.sender, assets, sharesBurn);
    }

    function addCollateral(uint256 assets) external nonReentrant accrued {
        if (assets < 1) revert ZeroAmount();
        totalCollateral += assets;
        uint256 updated = positions.addCollateral(msg.sender, assets);
        if (updated < assets) revert ShareAccountingMismatch();
        uint256 received = _takeAndDeposit(collateralAsset, LiquidityHub.BucketKind.Collateral, msg.sender, assets);
        if (received < assets) revert FeeOnTransferNotSupported();
        emit CollateralAdded(msg.sender, received);
    }

    function removeCollateral(uint256 assets) external nonReentrant whenRiskAllowed accrued {
        _requireFreshOracles();
        if (assets < 1) revert ZeroAmount();
        uint256 current = positions.collateralAssets(msg.sender);
        if (assets > current) revert InsufficientLiquidity();
        totalCollateral -= assets;
        uint256 updated = positions.subCollateral(msg.sender, assets);
        if (updated > current || updated + assets < current || updated + assets > current) {
            revert ShareAccountingMismatch();
        }
        _requireHealthy(msg.sender);
        hub.withdraw(collateralAsset, LiquidityHub.BucketKind.Collateral, msg.sender, assets);
        emit CollateralRemoved(msg.sender, assets);
    }

    function borrow(uint256 assets) external nonReentrant whenRiskAllowed accrued {
        _requireFreshOracles();
        if (assets < 1) revert ZeroAmount();
        _requireEligible(msg.sender);
        if (assets > _available()) revert InsufficientLiquidity();

        uint256 oldShares = positions.debtShares(msg.sender);
        uint256 minted = _quoteBorrow(oldShares, reserve.borrowIndex, assets);
        uint256 newUserShares = oldShares + minted;
        uint256 newTotalShares = reserve.totalBorrowShares + minted;
        Caps.checkBorrow(
            caps,
            ReserveAccounting.debtAssets(newTotalShares, reserve.borrowIndex),
            ReserveAccounting.debtAssets(newUserShares, reserve.borrowIndex)
        );

        reserve.totalBorrowShares = newTotalShares;
        uint256 updated = positions.addDebtShares(msg.sender, minted);
        if (updated < minted) revert ShareAccountingMismatch();
        _requireWithinLtv(msg.sender);

        hub.draw(borrowAsset, msg.sender, assets);
        emit Borrowed(msg.sender, assets, minted);
    }

    /// @notice Repay `onBehalf`'s debt. Allowed while the market is paused and without a fresh oracle.
    /// @dev Pause flags do not cover this function. A guardian pause cannot reject a repayment.
    /// @dev Pass `type(uint256).max` to repay the full current debt. The payer is charged the debt reduction,
    ///      which can be 1 wei below the requested amount when share rounding cannot land on the request.
    function repay(address onBehalf, uint256 assets) external nonReentrant accrued {
        if (onBehalf == address(0)) revert ZeroAddress();
        uint256 shares = positions.debtShares(onBehalf);
        (uint256 pay, uint256 burned) = _quoteRepay(shares, reserve.borrowIndex, assets);
        reserve.totalBorrowShares -= burned;
        uint256 updated = positions.subDebtShares(onBehalf, burned);
        if (updated > shares || updated + burned < shares || updated + burned > shares) {
            revert ShareAccountingMismatch();
        }
        _forwardRestore(borrowAsset, msg.sender, pay);
        emit Repaid(onBehalf, msg.sender, pay, burned);
    }

    /// @notice Permissionless liquidation of a position whose Health Factor is below 1.
    /// @dev Blocked while paused and when either oracle is stale. Seize value cannot exceed repaid value times bonus.
    function liquidate(address borrower, uint256 repayRequested) external nonReentrant whenRiskAllowed accrued {
        _requireFreshOracles();
        if (borrower == address(0)) revert ZeroAddress();
        if (msg.sender == borrower) revert SelfLiquidation();

        uint256 debtSharesBefore = positions.debtShares(borrower);
        uint256 collateralBefore = positions.collateralAssets(borrower);
        (uint256 pay, uint256 burned, uint256 seize) = _sizeLiquidation(borrower, repayRequested);

        reserve.totalBorrowShares -= burned;
        totalCollateral -= seize;
        uint256 debtLeft = positions.subDebtShares(borrower, burned);
        uint256 collateralLeft = positions.subCollateral(borrower, seize);
        if (debtLeft > debtSharesBefore || debtLeft + burned < debtSharesBefore || debtLeft + burned > debtSharesBefore)
        {
            revert ShareAccountingMismatch();
        }
        if (
            collateralLeft > collateralBefore || collateralLeft + seize < collateralBefore
                || collateralLeft + seize > collateralBefore
        ) revert ShareAccountingMismatch();

        _forwardRestore(borrowAsset, msg.sender, pay);
        hub.withdraw(collateralAsset, LiquidityHub.BucketKind.Collateral, msg.sender, seize);
        emit Liquidated(borrower, msg.sender, pay, seize);
    }

    function _sizeLiquidation(address borrower, uint256 repayRequested)
        internal
        view
        returns (uint256 pay, uint256 burned, uint256 seize)
    {
        (uint256 collateralBalance, uint256 debtBalance, uint256 collateralValue, uint256 debtValue) =
            _loadValues(borrower);
        if (!risk.isLiquidatable(fhe.encrypt(collateralValue), fhe.encrypt(debtValue), liquidationThresholdWad)) {
            revert NotLiquidatable();
        }

        (uint256 debtPrice, uint8 debtDecimals) = oracle.priceWadPerWholeToken(borrowAsset);
        (uint256 collateralPrice, uint8 collateralDecimals) = oracle.priceWadPerWholeToken(collateralAsset);
        uint256 cappedRepay = _cappedRepay(
            debtBalance,
            collateralBalance,
            collateralValue,
            debtValue,
            repayRequested,
            debtPrice,
            collateralPrice,
            debtDecimals,
            collateralDecimals
        );

        (pay, burned) = _quoteRepay(positions.debtShares(borrower), reserve.borrowIndex, cappedRepay);
        uint256 repayValue;
        uint256 seizeValue;
        (seize, repayValue, seizeValue) = liquidationEngine.seizeForRepay(
            pay, collateralBalance, liquidationBonusWad, debtPrice, collateralPrice, debtDecimals, collateralDecimals
        );
        if (repayValue < 1 || seizeValue < 1) revert NotLiquidatable();
        _requireBonus(pay, seize);
    }

    function _cappedRepay(
        uint256 debtBalance,
        uint256 collateralBalance,
        uint256 collateralValue,
        uint256 debtValue,
        uint256 repayRequested,
        uint256 debtPrice,
        uint256 collateralPrice,
        uint8 debtDecimals,
        uint8 collateralDecimals
    ) internal view returns (uint256) {
        LiquidationEngine.Quote memory q = liquidationEngine.quote(
            LiquidationEngine.QuoteInput({
                debtAssets: debtBalance,
                collateralAssets: collateralBalance,
                repayRequested: repayRequested,
                debtValueWad: debtValue,
                collateralValueWad: collateralValue,
                bonusWad: liquidationBonusWad,
                closeFactorWad: closeFactorWad,
                dustValueWad: dustValueWad,
                debtPriceWadPerWhole: debtPrice,
                collateralPriceWadPerWhole: collateralPrice,
                debtDecimals: debtDecimals,
                collateralDecimals: collateralDecimals
            })
        );
        return q.repayAssets;
    }

    function _requireBonus(uint256 pay, uint256 seize) internal view {
        uint256 repayValue = oracle.tokenValueWad(borrowAsset, pay, Math.Rounding.Floor);
        uint256 seizeValue = oracle.tokenValueWad(collateralAsset, seize, Math.Rounding.Floor);
        if (!Math512.mulGte(repayValue, liquidationBonusWad, seizeValue, FixedPoint.WAD)) revert BonusExceeded();
        if (!fhe.productGte(fhe.encrypt(repayValue), liquidationBonusWad, fhe.encrypt(seizeValue), FixedPoint.WAD)) {
            revert BonusExceeded();
        }
    }

    function setRiskParams(
        uint256 ltv,
        uint256 liquidationThreshold,
        uint256 bonus,
        uint256 closeFactor,
        uint256 reserveFactor,
        uint256 dust
    ) external onlyRole(CURATOR_ROLE) {
        _setRisk(ltv, liquidationThreshold, bonus, closeFactor, reserveFactor, dust);
    }

    function setCaps(uint256 supplyCap, uint256 borrowCap, uint256 walletSupplyCap, uint256 walletBorrowCap)
        external
        onlyRole(CURATOR_ROLE)
    {
        _setCaps(supplyCap, borrowCap, walletSupplyCap, walletBorrowCap);
    }

    function setRateParams(uint256 baseRate, uint256 slope1, uint256 slope2, uint256 optimalUtil)
        external
        onlyRole(CURATOR_ROLE)
    {
        _setRates(baseRate, slope1, slope2, optimalUtil);
    }

    function setFeeRecipient(address recipient) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (recipient == address(0)) revert ZeroAddress();
        feeRecipient = recipient;
        emit FeeRecipientUpdated(recipient);
    }

    /// @notice Install or clear the supply/borrow gate. The zero address clears it.
    /// @dev On markets created by MarketFactory the admin is the curator timelock, so this call is delayed.
    function setEligibility(IEligibilityAdapter adapter) external onlyRole(DEFAULT_ADMIN_ROLE) {
        eligibility = adapter;
        emit EligibilityUpdated(address(adapter));
    }

    function borrowIndex() external view returns (uint256) {
        return reserve.borrowIndex;
    }

    function supplyIndex() external view returns (uint256) {
        return reserve.supplyIndex;
    }

    function totalSupplyShares() external view returns (uint256) {
        return reserve.totalSupplyShares;
    }

    function totalBorrowShares() external view returns (uint256) {
        return reserve.totalBorrowShares;
    }

    function totalSupplyAssets() external view returns (uint256) {
        return ReserveAccounting.supplyAssets(reserve.totalSupplyShares, reserve.supplyIndex);
    }

    function totalDebtAssets() external view returns (uint256) {
        return ReserveAccounting.debtAssets(reserve.totalBorrowShares, reserve.borrowIndex);
    }

    function supplyShares(address user) external view returns (uint256) {
        return positions.supplyShares(user);
    }

    function debtShares(address user) external view returns (uint256) {
        return positions.debtShares(user);
    }

    function collateralAssets(address user) external view returns (uint256) {
        return positions.collateralAssets(user);
    }

    function debtAssets(address user) external view returns (uint256) {
        ReserveAccounting.Reserve memory preview = _previewReserve();
        return ReserveAccounting.debtAssets(positions.debtShares(user), preview.borrowIndex);
    }

    function availableLiquidity() external view returns (uint256) {
        return _availablePreview();
    }

    /// @notice Health Factor in WAD using indexes accrued up to this block, without writing state.
    /// @dev Reverts if an oracle is stale or disabled. Does not fabricate a price.
    function healthFactorWad(address user) external view returns (uint256) {
        ReserveAccounting.Reserve memory preview = _previewReserve();
        (,, uint256 collateralValue, uint256 debtValue) = _loadValuesAt(user, preview.borrowIndex);
        return risk.healthFactorWad(collateralValue, debtValue, liquidationThresholdWad);
    }

    /// @notice Instantaneous rate snapshot after a memory accrual. Supplier APR is an estimate.
    function previewRates()
        external
        view
        returns (uint256 utilizationWad, uint256 borrowRatePerYearWad, uint256 supplyRatePerYearWad)
    {
        ReserveAccounting.Reserve memory preview = _previewReserve();
        uint256 debt = ReserveAccounting.debtAssets(preview.totalBorrowShares, preview.borrowIndex);
        uint256 supplyAssets_ = ReserveAccounting.supplyAssets(preview.totalSupplyShares, preview.supplyIndex);
        utilizationWad = ReserveAccounting.utilizationWad(debt, supplyAssets_);
        borrowRatePerYearWad = interestRateModel.borrowRatePerYearWad(rateParams, utilizationWad);
        supplyRatePerYearWad =
            interestRateModel.supplyRatePerYearWad(borrowRatePerYearWad, utilizationWad, reserveFactorWad);
    }

    /// @dev User approves this market. Tokens move user -> market -> hub so allowances are not shared across spokes.
    function _takeAndDeposit(address asset, LiquidityHub.BucketKind kind, address from, uint256 amount)
        internal
        returns (uint256 received)
    {
        _pullExact(asset, from, amount);
        IERC20(asset).forceApprove(address(hub), amount);
        received = hub.deposit(asset, kind, amount);
        IERC20(asset).forceApprove(address(hub), 0);
    }

    function _forwardRestore(address asset, address from, uint256 amount) internal {
        _pullExact(asset, from, amount);
        IERC20(asset).forceApprove(address(hub), amount);
        uint256 restored = hub.restore(asset, amount);
        if (restored < amount) revert FeeOnTransferNotSupported();
        IERC20(asset).forceApprove(address(hub), 0);
    }

    function _pullExact(address asset, address from, uint256 amount) internal {
        uint256 beforeBal = IERC20(asset).balanceOf(address(this));
        IERC20(asset).safeTransferFrom(from, address(this), amount);
        uint256 afterBal = IERC20(asset).balanceOf(address(this));
        if (afterBal < beforeBal || afterBal - beforeBal != amount) revert FeeOnTransferNotSupported();
    }

    function _accrue() internal {
        uint256 rate = _storedRate();
        ReserveAccounting.Reserve memory next = reserve;
        (uint256 interestAssets, uint256 feeShares) =
            ReserveAccounting.accrue(next, rate, reserveFactorWad, block.timestamp);
        reserve.totalSupplyShares = next.totalSupplyShares;
        reserve.totalBorrowShares = next.totalBorrowShares;
        reserve.supplyIndex = next.supplyIndex;
        reserve.borrowIndex = next.borrowIndex;
        reserve.lastAccrual = next.lastAccrual;
        if (feeShares > 0) pendingFeeShares += feeShares;
        if (interestAssets > 0 || feeShares > 0) {
            emit Accrued(reserve.supplyIndex, reserve.borrowIndex, interestAssets, feeShares);
        }
    }

    function _flushFees() internal {
        uint256 shares = pendingFeeShares;
        if (shares < 1) return;
        pendingFeeShares = 0;
        uint256 updated = positions.addSupplyShares(feeRecipient, shares);
        if (updated < shares) revert ShareAccountingMismatch();
    }

    function _storedRate() internal view returns (uint256) {
        uint256 debt = ReserveAccounting.debtAssets(reserve.totalBorrowShares, reserve.borrowIndex);
        uint256 supplyAssets_ = ReserveAccounting.supplyAssets(reserve.totalSupplyShares, reserve.supplyIndex);
        uint256 utilization = ReserveAccounting.utilizationWad(debt, supplyAssets_);
        return interestRateModel.borrowRatePerYearWad(rateParams, utilization);
    }

    function _previewReserve() internal view returns (ReserveAccounting.Reserve memory preview) {
        preview = reserve;
        uint256 debt = ReserveAccounting.debtAssets(reserve.totalBorrowShares, reserve.borrowIndex);
        uint256 supplyAssets_ = ReserveAccounting.supplyAssets(reserve.totalSupplyShares, reserve.supplyIndex);
        uint256 utilization = ReserveAccounting.utilizationWad(debt, supplyAssets_);
        uint256 rate = interestRateModel.borrowRatePerYearWad(rateParams, utilization);
        (uint256 interestAssets, uint256 feeShares) =
            ReserveAccounting.accrue(preview, rate, reserveFactorWad, block.timestamp);
        if (feeShares > preview.totalSupplyShares) revert ShareAccountingMismatch();
        if (interestAssets > 0 && preview.borrowIndex < reserve.borrowIndex) revert ShareAccountingMismatch();
    }

    function _available() internal view returns (uint256) {
        uint256 supplyAssets_ = ReserveAccounting.supplyAssets(reserve.totalSupplyShares, reserve.supplyIndex);
        uint256 debt = ReserveAccounting.debtAssets(reserve.totalBorrowShares, reserve.borrowIndex);
        uint256 accounted = supplyAssets_ > debt ? supplyAssets_ - debt : 0;
        uint256 cash = hub.cashOf(address(this), borrowAsset, LiquidityHub.BucketKind.Liquidity);
        return accounted < cash ? accounted : cash;
    }

    function _availablePreview() internal view returns (uint256) {
        ReserveAccounting.Reserve memory preview = _previewReserve();
        uint256 supplyAssets_ = ReserveAccounting.supplyAssets(preview.totalSupplyShares, preview.supplyIndex);
        uint256 debt = ReserveAccounting.debtAssets(preview.totalBorrowShares, preview.borrowIndex);
        uint256 accounted = supplyAssets_ > debt ? supplyAssets_ - debt : 0;
        uint256 cash = hub.cashOf(address(this), borrowAsset, LiquidityHub.BucketKind.Liquidity);
        return accounted < cash ? accounted : cash;
    }

    function _requireEligible(address user) internal view {
        IEligibilityAdapter gate = eligibility;
        if (address(gate) != address(0) && !gate.isEligible(address(this), user)) revert NotEligible();
    }

    function _requireFreshOracles() internal view {
        (
            uint256 collateralPrice,
            uint8 collateralPriceDecimals,
            uint8 collateralTokenDecimals,
            uint256 collateralUpdated
        ) = oracle.read(collateralAsset);
        (uint256 debtPrice, uint8 debtPriceDecimals, uint8 debtTokenDecimals, uint256 debtUpdated) =
            oracle.read(borrowAsset);
        if (collateralPrice < 1 || debtPrice < 1 || collateralUpdated < 1 || debtUpdated < 1) revert ZeroAmount();
        if (collateralPriceDecimals > 18 || debtPriceDecimals > 18) revert ZeroAmount();
        if (collateralTokenDecimals > 36 || debtTokenDecimals > 36) revert ZeroAmount();
    }

    function _requireHealthy(address user) internal view {
        (,, uint256 collateralValue, uint256 debtValue) = _loadValues(user);
        if (!risk.isHealthy(fhe.encrypt(collateralValue), fhe.encrypt(debtValue), liquidationThresholdWad)) {
            revert Unhealthy();
        }
    }

    function _requireWithinLtv(address user) internal view {
        (,, uint256 collateralValue, uint256 debtValue) = _loadValues(user);
        bytes32 collateralWord = fhe.encrypt(collateralValue);
        bytes32 debtWord = fhe.encrypt(debtValue);
        if (!risk.withinLtv(collateralWord, debtWord, ltvWad)) revert LtvExceeded();
        if (!risk.isHealthy(collateralWord, debtWord, liquidationThresholdWad)) revert Unhealthy();
    }

    function _loadValues(address user)
        internal
        view
        returns (uint256 collateralBalance, uint256 debtBalance, uint256 collateralValue, uint256 debtValue)
    {
        return _loadValuesAt(user, reserve.borrowIndex);
    }

    function _loadValuesAt(address user, uint256 index)
        internal
        view
        returns (uint256 collateralBalance, uint256 debtBalance, uint256 collateralValue, uint256 debtValue)
    {
        collateralBalance = positions.collateralAssets(user);
        debtBalance = ReserveAccounting.debtAssets(positions.debtShares(user), index);
        collateralValue = oracle.tokenValueWad(collateralAsset, collateralBalance, Math.Rounding.Floor);
        debtValue = oracle.tokenValueWad(borrowAsset, debtBalance, Math.Rounding.Ceil);
    }

    function _quoteBorrow(uint256 oldShares, uint256 index, uint256 assets) internal pure returns (uint256 minted) {
        minted = Math.mulDiv(assets, FixedPoint.RAY, index, Math.Rounding.Ceil);
        if (minted < 1) minted = 1;
        uint256 oldDebt = ReserveAccounting.debtAssets(oldShares, index);
        uint256 newDebt = ReserveAccounting.debtAssets(oldShares + minted, index);
        if (newDebt < oldDebt + assets) {
            minted += 1;
            newDebt = ReserveAccounting.debtAssets(oldShares + minted, index);
        }
        if (newDebt < oldDebt + assets) revert BorrowRounding();
    }

    function _quoteRepay(uint256 shares, uint256 index, uint256 assetsRequested)
        internal
        pure
        returns (uint256 pay, uint256 sharesBurned)
    {
        uint256 owed = ReserveAccounting.debtAssets(shares, index);
        if (owed < 1 || shares < 1) revert NoDebt();
        if (assetsRequested < 1) revert ZeroAmount();
        if (assetsRequested >= owed) return (owed, shares);

        uint256 target = owed - assetsRequested;
        uint256 newShares = Math.mulDiv(target, FixedPoint.RAY, index, Math.Rounding.Ceil);
        if (newShares >= shares) revert RepayTooSmall();
        uint256 newOwed = ReserveAccounting.debtAssets(newShares, index);
        if (newOwed >= owed) revert RepayTooSmall();
        pay = owed - newOwed;
        if (pay < 1 || pay > assetsRequested) revert RepayTooSmall();
        sharesBurned = shares - newShares;
    }

    function _setRisk(
        uint256 ltv,
        uint256 liquidationThreshold,
        uint256 bonus,
        uint256 closeFactor,
        uint256 reserveFactor,
        uint256 dust
    ) internal {
        if (ltv > liquidationThreshold) revert LtvAboveThreshold();
        if (liquidationThreshold == 0 || liquidationThreshold > MAX_LT_WAD) revert BadLiquidationThreshold();
        if (bonus < MIN_BONUS_WAD || bonus > MAX_BONUS_WAD) revert BadBonus();
        if (closeFactor < MIN_CLOSE_WAD || closeFactor > FixedPoint.WAD) revert BadCloseFactor();
        if (reserveFactor > MAX_RESERVE_FACTOR_WAD) revert BadReserveFactor();
        if (dust > MAX_DUST_WAD) revert BadDust();
        ltvWad = ltv;
        liquidationThresholdWad = liquidationThreshold;
        liquidationBonusWad = bonus;
        closeFactorWad = closeFactor;
        reserveFactorWad = reserveFactor;
        dustValueWad = dust;
        emit RiskParamsUpdated(ltv, liquidationThreshold, bonus, closeFactor, reserveFactor, dust);
    }

    function _setCaps(uint256 supplyCap, uint256 borrowCap, uint256 walletSupplyCap, uint256 walletBorrowCap)
        internal
    {
        caps = Caps.Limits({
            supplyCap: supplyCap,
            borrowCap: borrowCap,
            walletSupplyCap: walletSupplyCap,
            walletBorrowCap: walletBorrowCap
        });
        emit CapsUpdated(supplyCap, borrowCap, walletSupplyCap, walletBorrowCap);
    }

    function _setRates(uint256 baseRate, uint256 slope1, uint256 slope2, uint256 optimalUtil) internal {
        InterestRateModel.RateParams memory params = InterestRateModel.RateParams({
            baseRateWad: baseRate,
            slope1Wad: slope1,
            slope2Wad: slope2,
            optimalUtilWad: optimalUtil
        });
        interestRateModel.validate(params);
        rateParams = params;
        emit RateParamsUpdated(baseRate, slope1, slope2, optimalUtil);
    }
}
// slither-disable-end reentrancy-no-eth
