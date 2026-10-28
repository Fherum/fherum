// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {AllowlistEligibility} from "../../src/AllowlistEligibility.sol";
import {ForgeAdmin} from "../../src/ForgeAdmin.sol";
import {LensReader} from "../../src/LensReader.sol";
import {Market} from "../../src/Market.sol";
import {MarketFactory} from "../../src/MarketFactory.sol";
import {CuratorRegistry} from "../../src/CuratorRegistry.sol";
import {IEligibilityAdapter} from "../../src/interfaces/IEligibilityAdapter.sol";
import {TimelockController} from "@openzeppelin/contracts/governance/TimelockController.sol";
import {ProtocolFixture} from "./ProtocolFixture.sol";

contract G4Fixture is ProtocolFixture {
    uint256 internal constant MIN_DELAY = 1 days;

    ForgeAdmin internal forgeAdmin;
    TimelockController internal timelock;
    CuratorRegistry internal registry;
    MarketFactory internal factory;
    LensReader internal lens;
    AllowlistEligibility internal eligibility;

    function setUp() public virtual override {
        super.setUp();
        forgeAdmin = new ForgeAdmin(governor, curator, MIN_DELAY);
        timelock = forgeAdmin.timelock();
        registry = forgeAdmin.registry();
        lens = new LensReader();
        eligibility = new AllowlistEligibility(governor, curator);
        factory = new MarketFactory(governor, hub, timelock, registry, oracle, irm, emergency, fhe, risk, liquidation);
        vm.startPrank(governor);
        hub.grantRole(hub.DEFAULT_ADMIN_ROLE(), address(factory));
        registry.grantRole(registry.REGISTRAR_ROLE(), address(factory));
        vm.stopPrank();
    }

    function _curatedParams() internal view returns (MarketFactory.Params memory params) {
        params.feeRecipient = treasury;
        params.collateralAsset = address(collateralToken);
        params.borrowAsset = address(borrowToken);
        params.eligibility = IEligibilityAdapter(address(0));
        params.creditLimit = 800_000e18;
        params.ltvWad = 0.75e18;
        params.liquidationThresholdWad = 0.85e18;
        params.liquidationBonusWad = 1.05e18;
        params.closeFactorWad = 0.5e18;
        params.reserveFactorWad = 0.1e18;
        params.dustValueWad = 100e18;
        params.supplyCap = 1_000_000e18;
        params.borrowCap = 800_000e18;
        params.walletSupplyCap = 500_000e18;
        params.walletBorrowCap = 400_000e18;
        params.baseRateWad = 0;
        params.slope1Wad = 0.04e18;
        params.slope2Wad = 0.75e18;
        params.optimalUtilWad = 0.8e18;
    }

    function _createCuratedMarket() internal returns (Market spoke) {
        MarketFactory.Params memory params = _curatedParams();
        spoke = new Market(factory.configFor(params));
        vm.prank(governor);
        factory.registerMarket(spoke, params.creditLimit);
    }

    function _approveSpoke(address user, Market spoke) internal {
        vm.startPrank(user);
        borrowToken.approve(address(spoke), type(uint256).max);
        collateralToken.approve(address(spoke), type(uint256).max);
        vm.stopPrank();
    }
}
