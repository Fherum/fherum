// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

/// @title EmergencyController
/// @notice Guardian risk-pause switch. This contract cannot move tokens and cannot pause repay.
/// @dev Guardian and governor may pause. Only the governor (`DEFAULT_ADMIN_ROLE`) may unpause.
///      The pause taxonomy is fixed: borrow, collateral withdrawal, and liquidation.
///      Supply, borrow-asset withdrawal, accrual, and repay have no pause bit.
contract EmergencyController is AccessControl {
    bytes32 public constant GUARDIAN_ROLE = keccak256("GUARDIAN_ROLE");

    /// @notice Actions a guardian pause covers. Repay is absent on purpose.
    struct Taxonomy {
        bool supplyPausable;
        bool withdrawPausable;
        bool borrowPausable;
        bool removeCollateralPausable;
        bool liquidationPausable;
        bool repayPausable;
    }

    struct Flags {
        bool borrow;
        bool removeCollateral;
        bool liquidate;
    }

    mapping(address market => Flags flags) private _flags;

    event MarketPaused(address indexed market, address indexed caller);
    event MarketUnpaused(address indexed market, address indexed caller);
    event RiskPauseSet(
        address indexed market, address indexed caller, bool borrow, bool removeCollateral, bool liquidate
    );

    error ZeroAddress();
    error NotGuardian();

    constructor(address governor, address guardian) {
        if (governor == address(0) || guardian == address(0)) revert ZeroAddress();
        _grantRole(DEFAULT_ADMIN_ROLE, governor);
        _grantRole(GUARDIAN_ROLE, guardian);
    }

    /// @notice True when any risk action is paused. Repay is never included.
    function paused(address market) public view returns (bool) {
        Flags memory flags = _flags[market];
        return flags.borrow || flags.removeCollateral || flags.liquidate;
    }

    function borrowPaused(address market) external view returns (bool) {
        return _flags[market].borrow;
    }

    function removeCollateralPaused(address market) external view returns (bool) {
        return _flags[market].removeCollateral;
    }

    function liquidationPaused(address market) external view returns (bool) {
        return _flags[market].liquidate;
    }

    /// @notice Always false. Repay has no storage flag and no setter.
    function repayPaused(address) external pure returns (bool) {
        return false;
    }

    function pauseFlags(address market)
        external
        view
        returns (bool borrow, bool removeCollateral, bool liquidate, bool repayIsPaused)
    {
        Flags memory flags = _flags[market];
        return (flags.borrow, flags.removeCollateral, flags.liquidate, false);
    }

    /// @notice The fixed pause taxonomy. `repayPausable` is false in every deployment.
    function taxonomy() external pure returns (Taxonomy memory) {
        return Taxonomy({
            supplyPausable: false,
            withdrawPausable: false,
            borrowPausable: true,
            removeCollateralPausable: true,
            liquidationPausable: true,
            repayPausable: false
        });
    }

    function pause(address market) external {
        if (market == address(0)) revert ZeroAddress();
        if (!hasRole(GUARDIAN_ROLE, msg.sender) && !hasRole(DEFAULT_ADMIN_ROLE, msg.sender)) revert NotGuardian();
        _flags[market] = Flags({borrow: true, removeCollateral: true, liquidate: true});
        emit MarketPaused(market, msg.sender);
        emit RiskPauseSet(market, msg.sender, true, true, true);
    }

    function unpause(address market) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (market == address(0)) revert ZeroAddress();
        _flags[market] = Flags({borrow: false, removeCollateral: false, liquidate: false});
        emit MarketUnpaused(market, msg.sender);
        emit RiskPauseSet(market, msg.sender, false, false, false);
    }
}
