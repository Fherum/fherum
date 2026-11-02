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
import {LensReader} from "../src/LensReader.sol";
import {MarketFactory} from "../src/MarketFactory.sol";
import {Market} from "../src/Market.sol";
import {FeeController} from "../src/FeeController.sol";
import {IEligibilityAdapter} from "../src/interfaces/IEligibilityAdapter.sol";
import {IMarketStatus} from "../src/interfaces/IMarketStatus.sol";
import {TimelockController} from "@openzeppelin/contracts/governance/TimelockController.sol";

/// @title DeployMainnet
/// @notice Full FHERUM V1 stack for Robinhood Chain mainnet (4663). PUBLIC mode, PlaintextFHEAdapter,
///         no encryption. No mock tokens, no mock feeds, no public mint. Every parameter comes from env.
/// @dev Guards:
///      - block.chainid must be 4663, or 31337 with ALLOW_ANVIL=yes (local simulation / fork rehearsal).
///      - CONFIRM_MAINNET=yes is required in every case.
///      - TIMELOCK_DELAY >= 48h on 4663 (anvil may use ANVIL_TIMELOCK_DELAY_OVERRIDE for tests).
///      - GOVERNOR_SAFE must be a contract on 4663.
///      The deployer EOA is a temporary admin only. At the end it holds no role anywhere; this is asserted
///      on-chain before the broadcast ends (a failing assertion aborts the whole script before sending).
///
///      >>> CONSTRUCTOR-DRIFT WARNING: src/ is being edited concurrently (target-HF liquidation, curator fee
///      >>> split / FeeController, oracle deviation breaker). If any constructor or MarketFactory.Params
///      >>> changes, update the sections marked `CTOR-SYNC` below and re-run script/ops/local-e2e.sh.
///
///      Dry-run (no broadcast) against a fork:
///        anvil --fork-url https://robinhood-rpc.publicnode.com --chain-id 31337
///        ALLOW_ANVIL=yes CONFIRM_MAINNET=yes ... forge script script/DeployMainnet.s.sol --fork-url http://127.0.0.1:8545
///      Real deploy: see docs/ops/MAINNET-RUNBOOK.md. Never run --broadcast before audit sign-off.
contract DeployMainnet is Script {
    error WrongChain(uint256 chainId);
    error NotConfirmed();
    error DelayTooShort(uint256 delay);
    error SafeNotContract(address safe);
    error NoCode(string what, address target);
    error CapTooHigh(string what, uint256 value, uint256 ceiling);
    error AssertFail(string what);

    uint256 internal constant MIN_MAINNET_DELAY = 48 hours;

    struct Cfg {
        address safe;
        address guardian;
        address curator;
        address protocolTreasury;
        address curatorFeeRecipient;
        uint256 curatorShareWad;
        uint256 delay;
        address collateral;
        address borrow;
        address collateralFeed;
        address borrowFeed;
        uint8 collateralDecimals;
        uint8 borrowDecimals;
        uint32 collateralStaleness;
        uint32 borrowStaleness;
        uint256 collateralMaxAnswer;
        uint256 borrowMaxAnswer;
        uint16 collateralDeviationBps;
        uint16 borrowDeviationBps;
        address collateralMarketStatus;
        bool timelockAdminToSafe;
    }

    struct Deployed {
        PlaintextFHEAdapter fhe;
        RiskEngine risk;
        LiquidationEngine liq;
        InterestRateModel irm;
        EmergencyController emergency;
        OracleAdapter oracle;
        LiquidityHub hub;
        ForgeAdmin forgeAdmin;
        TimelockController timelock;
        CuratorRegistry registry;
        LensReader lens;
        MarketFactory factory;
        Market market;
        FeeController feeController;
    }

    function run() external returns (Deployed memory d) {
        _guardChain();
        Cfg memory c = _readCfg();
        MarketFactory.Params memory p = _readParams(c);
        _preflight(c, p);

        vm.startBroadcast();
        (, address me,) = vm.readCallers();

        // ---- CTOR-SYNC: core components ----
        d.fhe = new PlaintextFHEAdapter();
        d.risk = new RiskEngine(d.fhe);
        d.liq = new LiquidationEngine();
        d.irm = new InterestRateModel();
        d.emergency = new EmergencyController(c.safe, c.guardian); // governor = Safe from block 0
        d.oracle = new OracleAdapter(me); // temporary, handed to Safe below
        d.hub = new LiquidityHub(me); // temporary, handed to Safe + factory below

        d.oracle.setFeed(c.collateral, c.collateralFeed, c.collateralDecimals, c.collateralStaleness, c.collateralMaxAnswer);
        d.oracle.setFeed(c.borrow, c.borrowFeed, c.borrowDecimals, c.borrowStaleness, c.borrowMaxAnswer);
        if (c.collateralDeviationBps != 0) d.oracle.setMaxDeviation(c.collateral, c.collateralDeviationBps);
        if (c.borrowDeviationBps != 0) d.oracle.setMaxDeviation(c.borrow, c.borrowDeviationBps);
        if (c.collateralMarketStatus != address(0)) {
            d.oracle.setMarketStatus(c.collateral, IMarketStatus(c.collateralMarketStatus));
        }
        // Prove both feeds read cleanly under the configured staleness/bounds before anything else.
        d.oracle.read(c.collateral);
        d.oracle.read(c.borrow);

        d.hub.setAssetAllowed(c.collateral, true);
        d.hub.setAssetAllowed(c.borrow, true);

        // Deployer is the registry admin only long enough to grant REGISTRAR_ROLE to the factory.
        d.forgeAdmin = new ForgeAdmin(me, c.curator, c.delay);
        d.timelock = d.forgeAdmin.timelock();
        d.registry = d.forgeAdmin.registry();
        d.lens = new LensReader();
        d.factory = new MarketFactory(
            me, d.hub, d.timelock, d.registry, d.oracle, d.irm, d.emergency, d.fhe, d.risk, d.liq
        );
        d.hub.grantRole(d.hub.DEFAULT_ADMIN_ROLE(), address(d.factory));
        d.registry.grantRole(d.registry.REGISTRAR_ROLE(), address(d.factory));

        // ---- CTOR-SYNC: market (Market.MarketConfig built by factory.configFor) ----
        // Market.feeRecipient is the FeeController deployed right after it. Its address is predicted from the
        // deployer nonce (market = nonce n, FeeController = n + 1) and asserted below, so no admin call to the
        // market (admin = timelock) is needed. CTOR-SYNC: FeeController(market, admin, protocol, curator, share).
        p.feeRecipient = vm.computeCreateAddress(me, uint256(vm.getNonce(me)) + 1);
        d.market = new Market(d.factory.configFor(p));
        d.feeController = new FeeController(
            d.market, address(d.timelock), c.protocolTreasury, c.curatorFeeRecipient, c.curatorShareWad
        );
        _req(address(d.feeController) == p.feeRecipient, "fee controller address prediction");
        d.factory.registerMarket(d.market, p.creditLimit);

        _handOver(d, c, me);
        vm.stopBroadcast();

        _assertFinalState(d, c, p, me);
        _log(d, c, me);
    }

    // ------------------------------------------------------------------ guards

    function _guardChain() internal view {
        if (keccak256(bytes(vm.envOr("CONFIRM_MAINNET", string("")))) != keccak256("yes")) revert NotConfirmed();
        if (block.chainid == ChainIds.ROBINHOOD_MAINNET) return;
        if (block.chainid == ChainIds.ANVIL && keccak256(bytes(vm.envOr("ALLOW_ANVIL", string("")))) == keccak256("yes")) {
            return;
        }
        revert WrongChain(block.chainid);
    }

    function _isMainnet() internal view returns (bool) {
        return block.chainid == ChainIds.ROBINHOOD_MAINNET;
    }

    function _readCfg() internal view returns (Cfg memory c) {
        c.safe = vm.envAddress("GOVERNOR_SAFE");
        c.guardian = vm.envAddress("GUARDIAN");
        c.curator = vm.envAddress("CURATOR");
        // Fee split (FeeController per market): protocol part -> PROTOCOL_TREASURY (default Safe), curator part
        // -> CURATOR_FEE_RECIPIENT (default CURATOR). CURATOR_FEE_SHARE_WAD = curator share of the reserve fee,
        // default 0.2e18 (20%), hard-bounded <= 0.5e18 here and in FeeController.
        c.protocolTreasury = vm.envOr("PROTOCOL_TREASURY", c.safe);
        c.curatorFeeRecipient = vm.envOr("CURATOR_FEE_RECIPIENT", c.curator);
        c.curatorShareWad = vm.envOr("CURATOR_FEE_SHARE_WAD", uint256(0.2e18));
        c.delay = vm.envUint("TIMELOCK_DELAY");
        if (!_isMainnet()) c.delay = vm.envOr("ANVIL_TIMELOCK_DELAY_OVERRIDE", c.delay);

        c.collateral = vm.envAddress("COLLATERAL_ASSET");
        c.borrow = vm.envAddress("BORROW_ASSET");
        c.collateralFeed = vm.envAddress("COLLATERAL_FEED");
        c.borrowFeed = vm.envAddress("BORROW_FEED");
        c.collateralDecimals = uint8(vm.envUint("COLLATERAL_DECIMALS"));
        c.borrowDecimals = uint8(vm.envUint("BORROW_DECIMALS"));
        // Chainlink Robinhood feeds heartbeat is 24h; default staleness = heartbeat + 1h grace.
        c.collateralStaleness = uint32(vm.envOr("COLLATERAL_MAX_STALENESS", uint256(25 hours)));
        c.borrowStaleness = uint32(vm.envOr("BORROW_MAX_STALENESS", uint256(25 hours)));
        c.collateralMaxAnswer = vm.envUint("COLLATERAL_MAX_ANSWER");
        c.borrowMaxAnswer = vm.envUint("BORROW_MAX_ANSWER");
        // Breaker defaults: 1500 bps (15%) per round for a volatile collateral (ETH), 300 bps (3%) for a
        // stable borrow asset. Phase boundaries fall back to the cached reference (OracleAdapter.lastAccepted,
        // seeded by setMaxDeviation); see test/unit/OracleBreaker.t.sol. Set 0 to disable.
        c.collateralDeviationBps = uint16(vm.envOr("COLLATERAL_MAX_DEVIATION_BPS", uint256(1_500)));
        c.borrowDeviationBps = uint16(vm.envOr("BORROW_MAX_DEVIATION_BPS", uint256(300)));
        c.collateralMarketStatus = vm.envOr("COLLATERAL_MARKET_STATUS", address(0));
        // Default false: timelock is self-administered (role changes only via its own delayed proposals).
        // true = the Safe also holds TimelockController admin and can bypass the delay for role changes.
        c.timelockAdminToSafe = vm.envOr("TIMELOCK_ADMIN_TO_SAFE", false);
    }

    /// @dev Conservative launch defaults (units = borrow/collateral token base units; WAD for ratios).
    ///      CTOR-SYNC: MarketFactory.Params fields.
    function _readParams(Cfg memory c) internal view returns (MarketFactory.Params memory p) {
        uint256 bUnit = 10 ** c.borrowDecimals;
        uint256 cUnit = 10 ** c.collateralDecimals;
        p.feeRecipient = c.protocolTreasury; // placeholder; replaced by the predicted FeeController in run()
        p.collateralAsset = c.collateral;
        p.borrowAsset = c.borrow;
        p.eligibility = IEligibilityAdapter(vm.envOr("ELIGIBILITY", address(0))); // V1 public: none
        p.ltvWad = vm.envOr("LTV_WAD", uint256(0.6e18));
        p.liquidationThresholdWad = vm.envOr("LT_WAD", uint256(0.7e18));
        p.liquidationBonusWad = vm.envOr("LIQ_BONUS_WAD", uint256(1.08e18));
        p.closeFactorWad = vm.envOr("CLOSE_FACTOR_WAD", uint256(0.5e18));
        p.reserveFactorWad = vm.envOr("RESERVE_FACTOR_WAD", uint256(0.1e18));
        p.dustValueWad = vm.envOr("DUST_VALUE_WAD", uint256(10e18));
        // Launch caps: 100k supply / 50k borrow / 10k & 5k per wallet in borrow units (supply cap is in
        // borrow-asset units; borrowCap too). Override via env, but ceilings below are enforced.
        p.supplyCap = vm.envOr("SUPPLY_CAP", 100_000 * bUnit);
        p.borrowCap = vm.envOr("BORROW_CAP", 50_000 * bUnit);
        p.walletSupplyCap = vm.envOr("WALLET_SUPPLY_CAP", 10_000 * bUnit);
        p.walletBorrowCap = vm.envOr("WALLET_BORROW_CAP", 5_000 * bUnit);
        p.creditLimit = vm.envOr("CREDIT_LIMIT", p.borrowCap);
        p.baseRateWad = vm.envOr("BASE_RATE_WAD", uint256(0));
        p.slope1Wad = vm.envOr("SLOPE1_WAD", uint256(0.04e18));
        p.slope2Wad = vm.envOr("SLOPE2_WAD", uint256(0.75e18));
        p.optimalUtilWad = vm.envOr("OPTIMAL_UTIL_WAD", uint256(0.8e18));
        cUnit; // collateral caps are not separate params in V1
    }

    function _preflight(Cfg memory c, MarketFactory.Params memory p) internal view {
        if (_isMainnet()) {
            if (c.delay < MIN_MAINNET_DELAY) revert DelayTooShort(c.delay);
            if (c.safe.code.length == 0) revert SafeNotContract(c.safe);
        } else if (c.delay == 0) {
            revert DelayTooShort(c.delay);
        }
        if (c.collateral.code.length == 0) revert NoCode("collateral", c.collateral);
        if (c.borrow.code.length == 0) revert NoCode("borrow", c.borrow);
        if (c.collateralFeed.code.length == 0) revert NoCode("collateralFeed", c.collateralFeed);
        if (c.borrowFeed.code.length == 0) revert NoCode("borrowFeed", c.borrowFeed);
        if (c.collateralMarketStatus != address(0) && c.collateralMarketStatus.code.length == 0) {
            revert NoCode("marketStatus", c.collateralMarketStatus);
        }
        // Hard launch ceilings (raise later through the timelock, not here).
        uint256 bUnit = 10 ** c.borrowDecimals;
        uint256 ceil = vm.envOr("LAUNCH_CAP_CEILING", 1_000_000 * bUnit);
        if (p.supplyCap > ceil) revert CapTooHigh("supplyCap", p.supplyCap, ceil);
        if (p.borrowCap > ceil) revert CapTooHigh("borrowCap", p.borrowCap, ceil);
        if (p.creditLimit > p.borrowCap) revert CapTooHigh("creditLimit", p.creditLimit, p.borrowCap);
        if (p.walletSupplyCap > p.supplyCap) revert CapTooHigh("walletSupplyCap", p.walletSupplyCap, p.supplyCap);
        if (p.walletBorrowCap > p.borrowCap) revert CapTooHigh("walletBorrowCap", p.walletBorrowCap, p.borrowCap);
        if (c.protocolTreasury == address(0) || c.curatorFeeRecipient == address(0)) {
            revert NoCode("feeRecipient zero", address(0));
        }
        if (c.curatorShareWad > 0.5e18) revert CapTooHigh("curatorShareWad", c.curatorShareWad, 0.5e18);
        if (c.guardian == c.safe) console2.log("WARN: guardian == safe; a fast EOA/2-of-N guardian is recommended");
    }

    // ------------------------------------------------------------------ hand-over

    function _handOver(Deployed memory d, Cfg memory c, address me) internal {
        bytes32 admin = 0x00; // DEFAULT_ADMIN_ROLE everywhere (OZ AccessControl)

        d.oracle.grantRole(admin, c.safe);
        d.oracle.renounceRole(admin, me);

        d.hub.grantRole(admin, c.safe);
        d.hub.renounceRole(admin, me);

        d.factory.grantRole(admin, c.safe);
        d.factory.renounceRole(admin, me);

        d.registry.grantRole(admin, c.safe);
        d.registry.renounceRole(admin, me);

        // ForgeAdmin made `me` timelock admin. Hand it to the Safe (so it can later renounce under process)
        // or drop it entirely (TIMELOCK_ADMIN_TO_SAFE=false => timelock is self-administered only).
        if (c.timelockAdminToSafe) d.timelock.grantRole(admin, c.safe);
        d.timelock.renounceRole(admin, me);
    }

    // ------------------------------------------------------------------ assertions

    function _req(bool ok, string memory what) internal pure {
        if (!ok) revert AssertFail(what);
    }

    function _assertFinalState(Deployed memory d, Cfg memory c, MarketFactory.Params memory p, address me)
        internal
        view
    {
        bytes32 admin = 0x00;
        address tl = address(d.timelock);
        // Deployer holds nothing.
        _req(!d.oracle.hasRole(admin, me), "deployer oracle admin");
        _req(!d.hub.hasRole(admin, me), "deployer hub admin");
        _req(!d.factory.hasRole(admin, me), "deployer factory admin");
        _req(!d.registry.hasRole(admin, me), "deployer registry admin");
        _req(!d.registry.hasRole(d.registry.CURATOR_ROLE(), me) || me == c.curator, "deployer registry curator");
        _req(!d.timelock.hasRole(admin, me), "deployer timelock admin");
        _req(!d.emergency.hasRole(admin, me) || me == c.safe, "deployer emergency admin");
        _req(!d.market.hasRole(admin, me), "deployer market admin");
        _req(!d.market.hasRole(d.market.CURATOR_ROLE(), me), "deployer market curator");
        // Safe / timelock / guardian / curator.
        _req(d.oracle.hasRole(admin, c.safe), "safe oracle admin");
        _req(d.hub.hasRole(admin, c.safe), "safe hub admin");
        _req(d.hub.hasRole(admin, address(d.factory)), "factory hub admin");
        _req(d.factory.hasRole(admin, c.safe), "safe factory admin");
        _req(d.registry.hasRole(admin, c.safe), "safe registry admin");
        _req(d.registry.hasRole(d.registry.REGISTRAR_ROLE(), address(d.factory)), "factory registrar");
        _req(d.registry.hasRole(d.registry.CURATOR_ROLE(), c.curator), "curator role");
        _req(d.timelock.hasRole(admin, c.safe) == c.timelockAdminToSafe, "timelock admin");
        _req(d.timelock.hasRole(d.timelock.PROPOSER_ROLE(), address(d.registry)), "registry proposer");
        _req(d.timelock.hasRole(d.timelock.EXECUTOR_ROLE(), address(0)), "open executor");
        _req(d.timelock.getMinDelay() == c.delay, "timelock delay");
        _req(d.emergency.hasRole(admin, c.safe), "safe emergency admin");
        _req(d.emergency.hasRole(d.emergency.GUARDIAN_ROLE(), c.guardian), "guardian role");
        _req(d.market.hasRole(admin, tl), "timelock market admin");
        _req(d.market.hasRole(d.market.CURATOR_ROLE(), tl), "timelock market curator");
        // Market params.
        _req(uint8(d.market.privacyMode()) == 0, "privacy mode must be Public");
        _req(d.market.collateralAsset() == c.collateral && d.market.borrowAsset() == c.borrow, "assets");
        _req(d.market.ltvWad() == p.ltvWad, "ltv");
        _req(d.market.liquidationThresholdWad() == p.liquidationThresholdWad, "lt");
        (uint256 sc, uint256 bc, uint256 wsc, uint256 wbc) = d.market.caps();
        _req(sc == p.supplyCap && bc == p.borrowCap && wsc == p.walletSupplyCap && wbc == p.walletBorrowCap, "caps");
        _req(!d.emergency.paused(address(d.market)), "paused at launch");
        // Fee split.
        FeeController fc = d.feeController;
        _req(d.market.feeRecipient() == address(fc), "market feeRecipient == FeeController");
        _req(address(fc.market()) == address(d.market), "feeController market");
        _req(fc.hasRole(admin, tl), "timelock feeController admin");
        _req(!fc.hasRole(admin, me) && !fc.hasRole(admin, c.safe), "feeController admin only timelock");
        _req(fc.protocolRecipient() == c.protocolTreasury, "protocol recipient");
        _req(fc.curatorRecipient() == c.curatorFeeRecipient, "curator recipient");
        _req(fc.curatorShareWad() == c.curatorShareWad && c.curatorShareWad <= 0.5e18, "curator share");
        _req(d.oracle.maxDeviationBps(c.collateral) == c.collateralDeviationBps, "collateral breaker");
        _req(d.oracle.maxDeviationBps(c.borrow) == c.borrowDeviationBps, "borrow breaker");
        _req(d.hub.assetAllowed(c.collateral) && d.hub.assetAllowed(c.borrow), "assets listed");
        d.oracle.read(c.collateral);
        d.oracle.read(c.borrow);
        d.lens.snapshot(d.market);
    }

    function _log(Deployed memory d, Cfg memory c, address me) internal pure {
        console2.log("== FHERUM mainnet deployment (PUBLIC mode, PlaintextFHEAdapter) ==");
        console2.log("deployer (holds no roles)", me);
        console2.log("GOVERNOR_SAFE", c.safe);
        console2.log("GUARDIAN", c.guardian);
        console2.log("CURATOR", c.curator);
        console2.log("FHE_ADAPTER", address(d.fhe));
        console2.log("RISK_ENGINE", address(d.risk));
        console2.log("LIQUIDATION_ENGINE", address(d.liq));
        console2.log("IRM", address(d.irm));
        console2.log("EMERGENCY", address(d.emergency));
        console2.log("ORACLE", address(d.oracle));
        console2.log("HUB", address(d.hub));
        console2.log("FORGE_ADMIN", address(d.forgeAdmin));
        console2.log("TIMELOCK", address(d.timelock));
        console2.log("REGISTRY", address(d.registry));
        console2.log("LENS", address(d.lens));
        console2.log("FACTORY", address(d.factory));
        console2.log("MARKET", address(d.market));
        console2.log("FEE_CONTROLLER", address(d.feeController));
        console2.log("PROTOCOL_TREASURY", c.protocolTreasury);
        console2.log("CURATOR_FEE_RECIPIENT", c.curatorFeeRecipient);
        console2.log("CURATOR_FEE_SHARE_WAD", c.curatorShareWad);
    }
}
