// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {EmergencyController} from "../../src/EmergencyController.sol";
import {IEligibilityAdapter} from "../../src/interfaces/IEligibilityAdapter.sol";
import {InterestRateModel} from "../../src/InterestRateModel.sol";
import {LiquidationEngine} from "../../src/LiquidationEngine.sol";
import {LiquidityHub} from "../../src/LiquidityHub.sol";
import {Market} from "../../src/Market.sol";
import {OracleAdapter} from "../../src/OracleAdapter.sol";
import {PlaintextFHEAdapter} from "../../src/PlaintextFHEAdapter.sol";
import {RiskEngine} from "../../src/RiskEngine.sol";
import {MockAggregatorV3} from "../mocks/MockAggregatorV3.sol";
import {MockERC20} from "../mocks/MockERC20.sol";

contract ProtocolFixture is Test {
    LiquidityHub internal hub;
    OracleAdapter internal oracle;
    PlaintextFHEAdapter internal fhe;
    RiskEngine internal risk;
    LiquidationEngine internal liquidation;
    InterestRateModel internal irm;
    EmergencyController internal emergency;
    Market internal market;
    MockERC20 internal borrowToken;
    MockERC20 internal collateralToken;
    MockAggregatorV3 internal borrowFeed;
    MockAggregatorV3 internal collateralFeed;

    address internal governor = makeAddr("governor");
    address internal curator = makeAddr("curator");
    address internal guardian = makeAddr("guardian");
    address internal treasury = makeAddr("treasury");
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");
    address internal carol = makeAddr("carol");
    address internal liquidator = makeAddr("liquidator");

    function setUp() public virtual {
        vm.warp(1_700_000_000);
        _deployCore();
        _listAsset(address(borrowToken), address(borrowFeed), 18);
        _listAsset(address(collateralToken), address(collateralFeed), 18);
        market = _newMarket(address(collateralToken), address(borrowToken));
        _register(market, 800_000e18);
        _fund(alice, market);
        _fund(bob, market);
        _fund(carol, market);
        _fund(liquidator, market);
        _fund(treasury, market);
    }

    function _deployCore() internal {
        borrowToken = new MockERC20("Borrow Asset", "BOR", 18);
        collateralToken = new MockERC20("Collateral Asset", "COL", 18);
        borrowFeed = new MockAggregatorV3(8, 1e8);
        collateralFeed = new MockAggregatorV3(8, 1e8);
        fhe = new PlaintextFHEAdapter();
        risk = new RiskEngine(fhe);
        liquidation = new LiquidationEngine();
        irm = new InterestRateModel();
        emergency = new EmergencyController(governor, guardian);
        oracle = new OracleAdapter(governor);
        hub = new LiquidityHub(governor);
    }

    function _listAsset(address asset, address feed, uint8 tokenDecimals) internal {
        vm.prank(governor);
        oracle.setFeed(asset, feed, tokenDecimals, 1 hours, type(uint256).max);
        vm.prank(governor);
        hub.setAssetAllowed(asset, true);
    }

    function _register(Market spoke, uint256 credit) internal {
        vm.startPrank(governor);
        hub.registerSpoke(address(spoke));
        hub.setCreditLimit(address(spoke), spoke.borrowAsset(), credit);
        vm.stopPrank();
    }

    function _newMarket(address coll, address bor) internal returns (Market spoke) {
        spoke = new Market(_config(coll, bor));
    }

    function _config(address coll, address bor) internal view returns (Market.MarketConfig memory cfg) {
        cfg.governor = governor;
        cfg.curator = curator;
        cfg.feeRecipient = treasury;
        cfg.hub = hub;
        cfg.collateralAsset = coll;
        cfg.borrowAsset = bor;
        cfg.oracle = oracle;
        cfg.interestRateModel = irm;
        cfg.emergency = emergency;
        cfg.fhe = fhe;
        cfg.risk = risk;
        cfg.liquidationEngine = liquidation;
        cfg.ltvWad = 0.75e18;
        cfg.liquidationThresholdWad = 0.85e18;
        cfg.liquidationBonusWad = 1.05e18;
        cfg.closeFactorWad = 0.5e18;
        cfg.reserveFactorWad = 0.1e18;
        cfg.dustValueWad = 100e18;
        cfg.supplyCap = 1_000_000e18;
        cfg.borrowCap = 800_000e18;
        cfg.walletSupplyCap = 500_000e18;
        cfg.walletBorrowCap = 400_000e18;
        cfg.baseRateWad = 0;
        cfg.slope1Wad = 0.04e18;
        cfg.slope2Wad = 0.75e18;
        cfg.optimalUtilWad = 0.8e18;
        cfg.eligibility = IEligibilityAdapter(address(0));
    }

    function _fund(address user, Market spoke) internal {
        uint256 amount = 1_000_000e18;
        borrowToken.mint(user, amount);
        collateralToken.mint(user, amount);
        vm.startPrank(user);
        borrowToken.approve(address(spoke), type(uint256).max);
        collateralToken.approve(address(spoke), type(uint256).max);
        vm.stopPrank();
    }

    function _poke() internal {
        borrowFeed.setUpdatedAt(block.timestamp);
        collateralFeed.setUpdatedAt(block.timestamp);
    }
}
