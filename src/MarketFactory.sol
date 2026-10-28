// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {TimelockController} from "@openzeppelin/contracts/governance/TimelockController.sol";
import {CuratorRegistry} from "./CuratorRegistry.sol";
import {EmergencyController} from "./EmergencyController.sol";
import {InterestRateModel} from "./InterestRateModel.sol";
import {LiquidationEngine} from "./LiquidationEngine.sol";
import {LiquidityHub} from "./LiquidityHub.sol";
import {Market} from "./Market.sol";
import {OracleAdapter} from "./OracleAdapter.sol";
import {RiskEngine} from "./RiskEngine.sol";
import {IEligibilityAdapter} from "./interfaces/IEligibilityAdapter.sol";
import {IFHEAdapter} from "./interfaces/IFHEAdapter.sol";

/// @title MarketFactory
/// @notice Creates a spoke whose governor and curator are the curator timelock, then registers it on the hub.
/// @dev Risk-parameter setters on the new market are callable by the timelock. The safe that admins this
///      factory can create markets. It does not receive `CURATOR_ROLE` on them.
contract MarketFactory is AccessControl {
    struct Params {
        address feeRecipient;
        address collateralAsset;
        address borrowAsset;
        IEligibilityAdapter eligibility;
        uint256 creditLimit;
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
    }

    LiquidityHub public immutable hub;
    TimelockController public immutable timelock;
    CuratorRegistry public immutable registry;
    OracleAdapter public immutable oracle;
    InterestRateModel public immutable interestRateModel;
    EmergencyController public immutable emergency;
    IFHEAdapter public immutable fhe;
    RiskEngine public immutable risk;
    LiquidationEngine public immutable liquidationEngine;

    event MarketCreated(address indexed market, address indexed collateralAsset, address indexed borrowAsset);

    error ZeroAddress();
    error AssetNotListed(address asset);
    error ComponentMismatch();
    error NotTimelockControlled();

    constructor(
        address admin,
        LiquidityHub hub_,
        TimelockController timelock_,
        CuratorRegistry registry_,
        OracleAdapter oracle_,
        InterestRateModel interestRateModel_,
        EmergencyController emergency_,
        IFHEAdapter fhe_,
        RiskEngine risk_,
        LiquidationEngine liquidationEngine_
    ) {
        if (
            admin == address(0) || address(hub_) == address(0) || address(timelock_) == address(0)
                || address(registry_) == address(0) || address(oracle_) == address(0)
                || address(interestRateModel_) == address(0) || address(emergency_) == address(0)
                || address(fhe_) == address(0) || address(risk_) == address(0) || address(liquidationEngine_) == address(0)
        ) revert ZeroAddress();
        hub = hub_;
        timelock = timelock_;
        registry = registry_;
        oracle = oracle_;
        interestRateModel = interestRateModel_;
        emergency = emergency_;
        fhe = fhe_;
        risk = risk_;
        liquidationEngine = liquidationEngine_;
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
    }

    /// @notice Build the config a market must be deployed with to be accepted by `registerMarket`.
    /// @dev Market initcode exceeds the 24 KB EIP-170 limit for any deployer contract, so markets are deployed
    ///      directly by an EOA/script with this config, then registered here.
    function configFor(Params calldata params) external view returns (Market.MarketConfig memory) {
        return Market.MarketConfig({
            governor: address(timelock),
            curator: address(timelock),
            feeRecipient: params.feeRecipient,
            hub: hub,
            collateralAsset: params.collateralAsset,
            borrowAsset: params.borrowAsset,
            oracle: oracle,
            interestRateModel: interestRateModel,
            emergency: emergency,
            fhe: fhe,
            risk: risk,
            liquidationEngine: liquidationEngine,
            ltvWad: params.ltvWad,
            liquidationThresholdWad: params.liquidationThresholdWad,
            liquidationBonusWad: params.liquidationBonusWad,
            closeFactorWad: params.closeFactorWad,
            reserveFactorWad: params.reserveFactorWad,
            dustValueWad: params.dustValueWad,
            supplyCap: params.supplyCap,
            borrowCap: params.borrowCap,
            walletSupplyCap: params.walletSupplyCap,
            walletBorrowCap: params.walletBorrowCap,
            baseRateWad: params.baseRateWad,
            slope1Wad: params.slope1Wad,
            slope2Wad: params.slope2Wad,
            optimalUtilWad: params.optimalUtilWad,
            eligibility: params.eligibility
        });
    }

    /// @notice Verify a deployed market is wired to this factory's components and controlled only by the
    ///         timelock, then register the spoke, set the borrow-asset credit line, and enroll it with the curator.
    /// @dev Admin-gated. The checks catch misconfiguration; they read the market's own getters, so the admin
    ///      must still only register markets deployed from the audited Market bytecode.
    function registerMarket(Market market, uint256 creditLimit) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (address(market) == address(0)) revert ZeroAddress();
        address collateralAsset = market.collateralAsset();
        address borrowAsset = market.borrowAsset();
        if (!hub.assetAllowed(collateralAsset)) revert AssetNotListed(collateralAsset);
        if (!hub.assetAllowed(borrowAsset)) revert AssetNotListed(borrowAsset);
        if (
            market.hub() != hub || market.oracle() != oracle || market.interestRateModel() != interestRateModel
                || market.emergency() != emergency || market.fhe() != fhe || market.risk() != risk
                || market.liquidationEngine() != liquidationEngine
        ) revert ComponentMismatch();
        if (market.initialGovernor() != address(timelock) || market.initialCurator() != address(timelock)) {
            revert NotTimelockControlled();
        }
        if (market.positions().market() != address(market)) revert ComponentMismatch();

        hub.registerSpoke(address(market));
        hub.setCreditLimit(address(market), borrowAsset, creditLimit);
        registry.registerMarket(address(market));
        emit MarketCreated(address(market), collateralAsset, borrowAsset);
    }
}
