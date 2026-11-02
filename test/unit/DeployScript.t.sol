// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {DeployRobinhoodTestnet} from "../../script/DeployRobinhoodTestnet.s.sol";

contract DeployScriptTest is Test {
    /// @dev One test on purpose: vm.setEnv is process-global, so two tests setting
    ///      FHERUM_BROADCAST in parallel race and flake.
    function test_broadcastFlagGuard() public {
        DeployRobinhoodTestnet script = new DeployRobinhoodTestnet();

        vm.setEnv("FHERUM_BROADCAST", "false");
        script.run();

        vm.setEnv("FHERUM_BROADCAST", "true");
        vm.expectRevert(DeployRobinhoodTestnet.BroadcastRefused.selector);
        script.run();

        vm.setEnv("FHERUM_BROADCAST", "false");
    }
}
