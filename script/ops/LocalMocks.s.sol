// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Script, console2} from "forge-std/Script.sol";
import {MockERC20} from "../../test/mocks/MockERC20.sol";
import {MockAggregatorV3} from "../../test/mocks/MockAggregatorV3.sol";

/// @notice LOCAL ANVIL ONLY (chainid 31337). Deploys mock tokens + mock Chainlink-style feeds so that
///         script/DeployMainnet.s.sol can be rehearsed end-to-end. Never used on 4663.
contract LocalMocks is Script {
    function run() external {
        require(block.chainid == 31337, "LocalMocks: anvil only");
        vm.startBroadcast();
        MockERC20 usd = new MockERC20("Local USD", "lUSD", 6);
        MockERC20 eth = new MockERC20("Local WETH", "lWETH", 18);
        MockAggregatorV3 usdFeed = new MockAggregatorV3(8, 1e8);
        MockAggregatorV3 ethFeed = new MockAggregatorV3(8, 2000e8);
        // Second round so a deviation breaker (roundId - 1) can be exercised.
        usdFeed.setAnswer(1e8);
        ethFeed.setAnswer(2001e8);
        vm.stopBroadcast();
        console2.log("BORROW_ASSET", address(usd));
        console2.log("COLLATERAL_ASSET", address(eth));
        console2.log("BORROW_FEED", address(usdFeed));
        console2.log("COLLATERAL_FEED", address(ethFeed));
    }
}
