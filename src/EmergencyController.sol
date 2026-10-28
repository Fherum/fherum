// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

/// @title EmergencyController
/// @notice Guardian pause switch. Pause is a boolean consulted by markets. This contract cannot move tokens.
/// @dev Guardian and governor may pause. Only the governor (DEFAULT_ADMIN_ROLE) may unpause.
///      Markets block borrow, collateral withdraw, and liquidation while paused. Repay stays available.
contract EmergencyController is AccessControl {
    bytes32 public constant GUARDIAN_ROLE = keccak256("GUARDIAN_ROLE");

    mapping(address market => bool isPaused) public paused;

    event MarketPaused(address indexed market, address indexed caller);
    event MarketUnpaused(address indexed market, address indexed caller);

    error ZeroAddress();
    error NotGuardian();

    constructor(address governor, address guardian) {
        if (governor == address(0) || guardian == address(0)) revert ZeroAddress();
        _grantRole(DEFAULT_ADMIN_ROLE, governor);
        _grantRole(GUARDIAN_ROLE, guardian);
    }

    function pause(address market) external {
        if (!hasRole(GUARDIAN_ROLE, msg.sender) && !hasRole(DEFAULT_ADMIN_ROLE, msg.sender)) revert NotGuardian();
        paused[market] = true;
        emit MarketPaused(market, msg.sender);
    }

    function unpause(address market) external onlyRole(DEFAULT_ADMIN_ROLE) {
        paused[market] = false;
        emit MarketUnpaused(market, msg.sender);
    }
}
