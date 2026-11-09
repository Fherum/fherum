// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Script, console2} from "forge-std/Script.sol";
import {ChainIds} from "../src/ChainIds.sol";
import {OracleAdapter} from "../src/OracleAdapter.sol";
import {LiquidityHub} from "../src/LiquidityHub.sol";
import {MarketFactory} from "../src/MarketFactory.sol";
import {Market} from "../src/Market.sol";
import {FeeController} from "../src/FeeController.sol";
import {IEligibilityAdapter} from "../src/interfaces/IEligibilityAdapter.sol";
import {IAggregatorV3} from "../src/interfaces/IAggregatorV3.sol";

/// @notice Adds one more market (spoke) to the EXISTING mainnet deployment.
/// @dev Step 1 (this script, any EOA, no protocol role): deploy Market + FeeController.
///      Step 2 (Safe, printed below): oracle.setFeed / setMaxDeviation, hub.setAssetAllowed,
///      factory.registerMarket. Nothing is live until the Safe executes step 2.
///      Stock-token collateral: Chainlink equity feeds stop on weekends/holidays. With a 25h staleness the
///      oracle fails closed off-hours: borrow / removeCollateral / liquidate revert; supply, repay, withdraw of
///      idle liquidity and addCollateral keep working. Conservative LTV covers the Monday gap.
///      Env: CONFIRM_MAINNET=yes, COLLATERAL, COLLATERAL_FEED, COLLATERAL_MAX_ANSWER (8-dec), plus optional
///      overrides below. Borrow asset defaults to USDG (feed already set on the adapter).
contract AddMarket is Script {
    // Mainnet 4663 core (deployed 2026-11-06).
    address constant SAFE = 0x3E7CEd699783751FBc7eb1545144DCe6C64D38CB;
    address constant CURATOR = 0x785213e0Fc5fB1A7c19AF26b3ea533Df56A448b7;
    OracleAdapter constant ORACLE = OracleAdapter(0x4572B9F17C9052fDAB5691f0dFbF0715dd60F9dE);
    LiquidityHub constant HUB = LiquidityHub(0x7A7FfDFBB89C296106dA1A85B6fb13F27Ca357d8);
    MarketFactory constant FACTORY = MarketFactory(0x16A295d143CeB63371078bFDf0681dBBeBff547a);
    address constant USDG = 0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168;

    /// @dev Robinhood Stock Tokens share one beacon; anything else with the same ticker is a copycat.
    address constant STOCK_BEACON = 0xe10b6f6B275de231345c20D14Ab812db62151b00;
    bytes32 constant BEACON_SLOT = 0xa3f0ad74e5423aebfd80d3ef4346578335a9a72aeaee59ff6cb3582b35133d50;

    error NotConfirmed();
    error WrongChain(uint256 id);
    error Bad(string what);

    struct Cfg {
        address collateral;
        address feed;
        uint8 decimals;
        uint32 staleness;
        uint256 maxAnswer;
        uint16 deviationBps;
        uint256 creditLimit;
    }

    function run() external returns (Market market, FeeController fee) {
        if (block.chainid == ChainIds.ROBINHOOD_MAINNET) {
            if (keccak256(bytes(vm.envOr("CONFIRM_MAINNET", string("")))) != keccak256("yes")) revert NotConfirmed();
        } else if (block.chainid != ChainIds.ANVIL) {
            revert WrongChain(block.chainid);
        }
        Cfg memory c = _cfg();
        MarketFactory.Params memory p = _params(c);
        _preflight(c, p);

        vm.startBroadcast();
        (, address me,) = vm.readCallers();
        p.feeRecipient = vm.computeCreateAddress(me, uint256(vm.getNonce(me)) + 1);
        market = new Market(FACTORY.configFor(p));
        fee = new FeeController(market, address(FACTORY.timelock()), SAFE, CURATOR, 0.2e18);
        vm.stopBroadcast();
        if (address(fee) != p.feeRecipient) revert Bad("fee controller address prediction");

        _printSafeBatch(c, market);
    }

    function _cfg() internal view returns (Cfg memory c) {
        c.collateral = vm.envAddress("COLLATERAL");
        c.feed = vm.envAddress("COLLATERAL_FEED");
        c.decimals = uint8(vm.envOr("COLLATERAL_DECIMALS", uint256(18)));
        c.staleness = uint32(vm.envOr("COLLATERAL_MAX_STALENESS", uint256(25 hours)));
        c.maxAnswer = vm.envUint("COLLATERAL_MAX_ANSWER");
        c.deviationBps = uint16(vm.envOr("COLLATERAL_DEVIATION_BPS", uint256(1500)));
    }

    /// @dev Stock defaults: stricter than WETH/USDG (LTV 50 / LT 60 / bonus 10%), small pre-audit caps.
    function _params(Cfg memory c) internal view returns (MarketFactory.Params memory p) {
        uint256 u = 1e6; // USDG
        p.collateralAsset = c.collateral;
        p.borrowAsset = USDG;
        p.feeRecipient = SAFE; // replaced by predicted FeeController
        p.eligibility = IEligibilityAdapter(address(0));
        p.ltvWad = vm.envOr("LTV_WAD", uint256(0.5e18));
        p.liquidationThresholdWad = vm.envOr("LT_WAD", uint256(0.6e18));
        p.liquidationBonusWad = vm.envOr("LIQ_BONUS_WAD", uint256(1.1e18));
        p.closeFactorWad = 0.5e18;
        p.reserveFactorWad = 0.1e18;
        p.dustValueWad = 10e18;
        p.supplyCap = vm.envOr("SUPPLY_CAP", 2_000 * u);
        p.borrowCap = vm.envOr("BORROW_CAP", 1_000 * u);
        p.walletSupplyCap = vm.envOr("WALLET_SUPPLY_CAP", 500 * u);
        p.walletBorrowCap = vm.envOr("WALLET_BORROW_CAP", 250 * u);
        p.creditLimit = p.borrowCap;
        p.baseRateWad = 0;
        p.slope1Wad = vm.envOr("SLOPE1_WAD", uint256(0.06e18));
        p.slope2Wad = vm.envOr("SLOPE2_WAD", uint256(0.9e18));
        p.optimalUtilWad = vm.envOr("OPTIMAL_UTIL_WAD", uint256(0.7e18));
        c.creditLimit = p.creditLimit;
    }

    function _preflight(Cfg memory c, MarketFactory.Params memory p) internal view {
        if (c.collateral.code.length == 0) revert Bad("collateral has no code");
        if (c.feed.code.length == 0) revert Bad("feed has no code");
        if (block.chainid == ChainIds.ROBINHOOD_MAINNET && vm.envOr("STOCK_TOKEN", true)) {
            address beacon = address(uint160(uint256(vm.load(c.collateral, BEACON_SLOT))));
            if (beacon != STOCK_BEACON) revert Bad("not a Robinhood Stock Token (beacon mismatch)");
        }
        if (IAggregatorV3(c.feed).decimals() != 8) revert Bad("feed decimals != 8");
        (, int256 ans,,,) = IAggregatorV3(c.feed).latestRoundData();
        if (ans <= 0 || uint256(ans) * 3 > c.maxAnswer) revert Bad("maxAnswer must be >= 3x spot");
        if (p.ltvWad >= p.liquidationThresholdWad || p.liquidationThresholdWad > 0.75e18) revert Bad("LTV/LT");
        if (p.borrowCap > 50_000e6 || p.supplyCap > 100_000e6) revert Bad("cap above launch ceiling");
        if (!HUB.assetAllowed(USDG)) revert Bad("USDG not allowed on hub");
        console2.log("spot (8 dec):", uint256(ans));
    }

    function _printSafeBatch(Cfg memory c, Market market) internal pure {
        console2.log("=== Market deployed (NOT live until the Safe executes) ===");
        console2.log("market:", address(market));
        console2.log("=== Safe 0x3E7C...38CB batch (execute in order) ===");
        console2.log("1 to OracleAdapter", address(ORACLE));
        console2.logBytes(abi.encodeCall(OracleAdapter.setFeed, (c.collateral, c.feed, c.decimals, c.staleness, c.maxAnswer)));
        console2.log("2 to OracleAdapter", address(ORACLE));
        console2.logBytes(abi.encodeCall(OracleAdapter.setMaxDeviation, (c.collateral, c.deviationBps)));
        console2.log("3 to LiquidityHub", address(HUB));
        console2.logBytes(abi.encodeCall(LiquidityHub.setAssetAllowed, (c.collateral, true)));
        console2.log("4 to MarketFactory", address(FACTORY));
        console2.logBytes(abi.encodeCall(MarketFactory.registerMarket, (market, c.creditLimit)));
        console2.log("Then add the market to NEXT_PUBLIC_MAINNET_MARKETS (comma-separated) and redeploy web.");
    }
}
