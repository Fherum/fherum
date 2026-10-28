// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {DeployRobinhoodTestnet} from "../../script/DeployRobinhoodTestnet.s.sol";

contract DeployScriptTest is Test {
    function test_dryRunDoesNotBroadcast() public {
        vm.setEnv("FHERUM_BROADCAST", "false");
        DeployRobinhoodTestnet script = new DeployRobinhoodTestnet();
        script.run();
    }

    function test_broadcastFlagReverts() public {
        vm.setEnv("FHERUM_BROADCAST", "true");
        DeployRobinhoodTestnet script = new DeployRobinhoodTestnet();
        vm.expectRevert(DeployRobinhoodTestnet.BroadcastRefused.selector);
        script.run();
    }
}
