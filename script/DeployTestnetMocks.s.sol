// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Script, console2} from "forge-std/Script.sol";
import {ChainIds} from "../src/ChainIds.sol";
import {PlaintextFHEAdapter} from "../src/PlaintextFHEAdapter.sol";
import {RiskEngine} from "../src/RiskEngine.sol";
import {LiquidationEngine} from "../src/LiquidationEngine.sol";
import {EmergencyController} from "../src/EmergencyController.sol";
import {OracleAdapter} from "../src/OracleAdapter.sol";
import {InterestRateModel} from "../src/InterestRateModel.sol";
import {LiquidityHub} from "../src/LiquidityHub.sol";
import {ForgeAdmin} from "../src/ForgeAdmin.sol";
import {CuratorRegistry} from "../src/CuratorRegistry.sol";
import {AllowlistEligibility} from "../src/AllowlistEligibility.sol";
import {LensReader} from "../src/LensReader.sol";
import {MarketFactory} from "../src/MarketFactory.sol";
import {Market} from "../src/Market.sol";
import {IEligibilityAdapter} from "../src/interfaces/IEligibilityAdapter.sol";
import {TimelockController} from "@openzeppelin/contracts/governance/TimelockController.sol";
import {MockERC20} from "../test/mocks/MockERC20.sol";
import {MockAggregatorV3} from "../test/mocks/MockAggregatorV3.sol";

/// @notice TESTNET-ONLY deployment with mock tokens and mock price feeds (46630 or anvil).
/// @dev Unaudited. The broadcaster EOA holds governor, curator and guardian roles — acceptable for a
///      testnet demo, never for mainnet. Tokens/feeds are mocks with no value. privacyMode is Public.
///      Run: forge script script/DeployTestnetMocks.s.sol --rpc-url $RPC --account <keystore> --broadcast
contract DeployTestnetMocks is Script {
    error WrongChain(uint256 chainId);

    uint256 internal constant MIN_DELAY = 1 hours;

    function run() external {
        if (block.chainid != ChainIds.ROBINHOOD_TESTNET && block.chainid != ChainIds.ANVIL) {
            revert WrongChain(block.chainid);
        }

        vm.startBroadcast();
        (, address me,) = vm.readCallers();

        MockERC20 bor = new MockERC20("FHERUM Test USD", "tUSD", 18);
        MockERC20 col = new MockERC20("FHERUM Test ETH", "tETH", 18);
        MockAggregatorV3 borFeed = new MockAggregatorV3(8, 1e8); // 1.00 (mock)
        MockAggregatorV3 colFeed = new MockAggregatorV3(8, 2000e8); // 2000.00 (mock)

        PlaintextFHEAdapter fhe = new PlaintextFHEAdapter();
        RiskEngine risk = new RiskEngine(fhe);
        LiquidationEngine liq = new LiquidationEngine();
        InterestRateModel irm = new InterestRateModel();
        EmergencyController emergency = new EmergencyController(me, me);
        OracleAdapter oracle = new OracleAdapter(me);
        LiquidityHub hub = new LiquidityHub(me);

        // Mock feeds never update, so staleness is relaxed to one year on testnet.
        oracle.setFeed(address(bor), address(borFeed), 18, 365 days, type(uint256).max);
        oracle.setFeed(address(col), address(colFeed), 18, 365 days, type(uint256).max);
        hub.setAssetAllowed(address(bor), true);
        hub.setAssetAllowed(address(col), true);

        ForgeAdmin admin = new ForgeAdmin(me, me, MIN_DELAY);
        TimelockController timelock = admin.timelock();
        CuratorRegistry registry = admin.registry();
        AllowlistEligibility eligibility = new AllowlistEligibility(me, me);
        LensReader lens = new LensReader();
        MarketFactory factory =
            new MarketFactory(me, hub, timelock, registry, oracle, irm, emergency, fhe, risk, liq);
        hub.grantRole(hub.DEFAULT_ADMIN_ROLE(), address(factory));
        registry.grantRole(registry.REGISTRAR_ROLE(), address(factory));

        MarketFactory.Params memory p;
        p.feeRecipient = me;
        p.collateralAsset = address(col);
        p.borrowAsset = address(bor);
        p.eligibility = IEligibilityAdapter(address(0));
        p.creditLimit = 800_000e18;
        p.ltvWad = 0.75e18;
        p.liquidationThresholdWad = 0.85e18;
        p.liquidationBonusWad = 1.05e18;
        p.closeFactorWad = 0.5e18;
        p.reserveFactorWad = 0.1e18;
        p.dustValueWad = 100e18;
        p.supplyCap = 1_000_000e18;
        p.borrowCap = 800_000e18;
        p.walletSupplyCap = 500_000e18;
        p.walletBorrowCap = 400_000e18;
        p.slope1Wad = 0.04e18;
        p.slope2Wad = 0.75e18;
        p.optimalUtilWad = 0.8e18;
        Market market = new Market(factory.configFor(p));
        factory.registerMarket(market, p.creditLimit);

        vm.stopBroadcast();

        console2.log("chainId", block.chainid);
        console2.log("deployer", me);
        console2.log("tUSD", address(bor));
        console2.log("tETH", address(col));
        console2.log("hub", address(hub));
        console2.log("oracle", address(oracle));
        console2.log("eligibility", address(eligibility));
        console2.log("NEXT_PUBLIC_LENS_READER", address(lens));
        console2.log("NEXT_PUBLIC_MARKET_FACTORY", address(factory));
        console2.log("market tETH/tUSD", address(market));
    }
}
