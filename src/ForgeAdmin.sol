// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {TimelockController} from "@openzeppelin/contracts/governance/TimelockController.sol";
import {CuratorRegistry} from "./CuratorRegistry.sol";

/// @title ForgeAdmin
/// @notice Deploys the curator timelock and registry. Holds admin only long enough to grant the safe and the registry, then renounces.
/// @dev The safe passed as `admin` is `DEFAULT_ADMIN_ROLE` on the timelock and on the registry.
///      The curator can queue risk updates through the registry. The registry is the timelock proposer.
///      Execution is open (`EXECUTOR_ROLE` on `address(0)`). Minimum delay must be non-zero.
///      After wiring, the safe should renounce timelock admin so later role changes are themselves delayed.
///      This contract keeps no role.
contract ForgeAdmin {
    TimelockController public immutable timelock;
    CuratorRegistry public immutable registry;

    error ZeroAddress();
    error ZeroDelay();

    constructor(address admin, address curator, uint256 minDelay) {
        if (admin == address(0) || curator == address(0)) revert ZeroAddress();
        if (minDelay < 1) revert ZeroDelay();

        address[] memory proposers = new address[](0);
        address[] memory executors = new address[](1);
        executors[0] = address(0);

        TimelockController locked = new TimelockController(minDelay, proposers, executors, address(this));
        CuratorRegistry curatorRegistry = new CuratorRegistry(admin, curator, locked);

        locked.grantRole(locked.DEFAULT_ADMIN_ROLE(), admin);
        locked.grantRole(locked.PROPOSER_ROLE(), address(curatorRegistry));
        locked.grantRole(locked.CANCELLER_ROLE(), address(curatorRegistry));
        locked.renounceRole(locked.DEFAULT_ADMIN_ROLE(), address(this));

        timelock = locked;
        registry = curatorRegistry;
    }
}
