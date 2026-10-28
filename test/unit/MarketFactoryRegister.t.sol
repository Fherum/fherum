// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {G4Fixture} from "../utils/G4Fixture.sol";
import {Market} from "../../src/Market.sol";
import {MarketFactory} from "../../src/MarketFactory.sol";
import {OracleAdapter} from "../../src/OracleAdapter.sol";

contract MarketFactoryRegisterTest is G4Fixture {
    function test_registersTimelockMarket() public {
        Market spoke = _createCuratedMarket();
        assertTrue(registry.isMarket(address(spoke)));
        assertEq(spoke.initialGovernor(), address(timelock));
    }

    function test_rejectsMarketWithForeignCurator() public {
        MarketFactory.Params memory params = _curatedParams();
        Market.MarketConfig memory cfg = factory.configFor(params);
        cfg.curator = address(0xBEEF);
        Market spoke = new Market(cfg);
        vm.prank(governor);
        vm.expectRevert(MarketFactory.NotTimelockControlled.selector);
        factory.registerMarket(spoke, params.creditLimit);
    }

    function test_rejectsMarketWithForeignOracle() public {
        MarketFactory.Params memory params = _curatedParams();
        Market.MarketConfig memory cfg = factory.configFor(params);
        cfg.oracle = new OracleAdapter(governor);
        Market spoke = new Market(cfg);
        vm.prank(governor);
        vm.expectRevert(MarketFactory.ComponentMismatch.selector);
        factory.registerMarket(spoke, params.creditLimit);
    }

    function test_onlyAdminRegisters() public {
        MarketFactory.Params memory params = _curatedParams();
        Market spoke = new Market(factory.configFor(params));
        vm.expectRevert();
        factory.registerMarket(spoke, params.creditLimit);
    }

    function test_cannotRegisterTwice() public {
        Market spoke = _createCuratedMarket();
        vm.prank(governor);
        vm.expectRevert();
        factory.registerMarket(spoke, 1);
    }
}
