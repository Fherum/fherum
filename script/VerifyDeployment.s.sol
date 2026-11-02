// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Script, console2} from "forge-std/Script.sol";
import {EmergencyController} from "../src/EmergencyController.sol";
import {OracleAdapter} from "../src/OracleAdapter.sol";
import {LiquidityHub} from "../src/LiquidityHub.sol";
import {CuratorRegistry} from "../src/CuratorRegistry.sol";
import {LensReader} from "../src/LensReader.sol";
import {MarketFactory} from "../src/MarketFactory.sol";
import {Market} from "../src/Market.sol";
import {FeeController} from "../src/FeeController.sol";
import {TimelockController} from "@openzeppelin/contracts/governance/TimelockController.sol";

/// @title VerifyDeployment
/// @notice READ-ONLY checks of a live FHERUM deployment. Never broadcasts (run is `view`).
/// @dev Env: FACTORY, MARKET, LENS, GOVERNOR_SAFE, GUARDIAN, CURATOR, DEPLOYER (the EOA that deployed),
///      optional EXPECT_TIMELOCK_DELAY (default 48h), EXPECT_TIMELOCK_ADMIN_SAFE (default false = timelock
///      self-administered), PROTOCOL_TREASURY (default Safe), CURATOR_FEE_RECIPIENT (default CURATOR),
///      EXPECT_CURATOR_FEE_SHARE_WAD (default: only checks <= 50%).
///      Other component addresses are derived from the factory's immutables.
///      forge script script/VerifyDeployment.s.sol --fork-url https://robinhood-rpc.publicnode.com
///      CTOR-SYNC: if new role-bearing contracts (e.g. FeeController) are added, add checks here.
contract VerifyDeployment is Script {
    uint256 internal failures;

    function _check(bool ok, string memory what) internal {
        if (ok) {
            console2.log("  OK  ", what);
        } else {
            console2.log("  FAIL", what);
            failures++;
        }
    }

    function run() external {
        MarketFactory factory = MarketFactory(vm.envAddress("FACTORY"));
        Market market = Market(vm.envAddress("MARKET"));
        LensReader lens = LensReader(vm.envAddress("LENS"));
        address safe = vm.envAddress("GOVERNOR_SAFE");
        address guardian = vm.envAddress("GUARDIAN");
        address curator = vm.envAddress("CURATOR");
        address deployer = vm.envAddress("DEPLOYER");
        uint256 expectDelay = vm.envOr("EXPECT_TIMELOCK_DELAY", uint256(48 hours));
        bool expectTlAdminSafe = vm.envOr("EXPECT_TIMELOCK_ADMIN_SAFE", false);

        LiquidityHub hub = factory.hub();
        TimelockController tl = factory.timelock();
        CuratorRegistry registry = factory.registry();
        OracleAdapter oracle = factory.oracle();
        EmergencyController emergency = factory.emergency();
        bytes32 admin = 0x00;

        console2.log("chainId", block.chainid);
        console2.log("-- wiring");
        _check(market.hub() == hub, "market.hub == factory.hub");
        _check(market.oracle() == oracle, "market.oracle == factory.oracle");
        _check(market.emergency() == emergency, "market.emergency == factory.emergency");
        _check(market.risk() == factory.risk(), "market.risk");
        _check(market.liquidationEngine() == factory.liquidationEngine(), "market.liquidationEngine");
        _check(market.fhe() == factory.fhe(), "market.fhe");
        _check(hub.isSpoke(address(market)), "hub registered market as spoke");
        _check(registry.isMarket(address(market)), "registry knows market");
        _check(uint8(market.privacyMode()) == 0, "privacyMode == Public");

        console2.log("-- deployer must hold nothing");
        _check(!hub.hasRole(admin, deployer), "hub");
        _check(!oracle.hasRole(admin, deployer), "oracle");
        _check(!factory.hasRole(admin, deployer), "factory");
        _check(!registry.hasRole(admin, deployer), "registry admin");
        _check(!registry.hasRole(registry.REGISTRAR_ROLE(), deployer), "registry registrar");
        _check(!tl.hasRole(admin, deployer), "timelock admin");
        _check(!tl.hasRole(tl.PROPOSER_ROLE(), deployer), "timelock proposer");
        _check(!emergency.hasRole(admin, deployer) || deployer == safe, "emergency admin");
        _check(!market.hasRole(admin, deployer), "market admin");
        _check(!market.hasRole(market.CURATOR_ROLE(), deployer), "market curator");

        console2.log("-- expected holders");
        _check(safe.code.length > 0 || block.chainid == 31337, "GOVERNOR_SAFE is a contract");
        _check(hub.hasRole(admin, safe), "hub admin: Safe");
        _check(hub.hasRole(admin, address(factory)), "hub admin: factory");
        _check(oracle.hasRole(admin, safe), "oracle admin: Safe");
        _check(factory.hasRole(admin, safe), "factory admin: Safe");
        _check(registry.hasRole(admin, safe), "registry admin: Safe");
        _check(registry.hasRole(registry.REGISTRAR_ROLE(), address(factory)), "registry registrar: factory");
        _check(registry.hasRole(registry.CURATOR_ROLE(), curator), "registry curator: CURATOR");
        _check(tl.hasRole(admin, safe) == expectTlAdminSafe, "timelock admin: Safe matches expectation");
        _check(tl.hasRole(tl.PROPOSER_ROLE(), address(registry)), "timelock proposer: registry");
        _check(tl.hasRole(tl.CANCELLER_ROLE(), address(registry)), "timelock canceller: registry");
        _check(tl.hasRole(tl.EXECUTOR_ROLE(), address(0)), "timelock executor: open");
        _check(tl.getMinDelay() >= expectDelay, "timelock delay >= expected");
        _check(emergency.hasRole(admin, safe), "emergency admin: Safe");
        _check(emergency.hasRole(emergency.GUARDIAN_ROLE(), guardian), "emergency guardian: GUARDIAN");
        _check(market.hasRole(admin, address(tl)), "market admin: timelock");
        _check(market.hasRole(market.CURATOR_ROLE(), address(tl)), "market curator: timelock");
        _check(!market.hasRole(admin, safe), "Safe is NOT direct market admin (must go via timelock)");

        console2.log("-- fee controller");
        FeeController fc = FeeController(market.feeRecipient());
        _check(address(fc).code.length > 0, "market.feeRecipient is a contract (FeeController)");
        _check(address(fc.market()) == address(market), "feeController.market == market");
        _check(address(fc.asset()) == market.borrowAsset(), "feeController.asset == borrowAsset");
        _check(fc.hasRole(admin, address(tl)), "feeController admin: timelock");
        _check(!fc.hasRole(admin, deployer), "feeController admin: not deployer");
        _check(!fc.hasRole(admin, safe), "feeController admin: not Safe directly");
        _check(fc.protocolRecipient() == vm.envOr("PROTOCOL_TREASURY", safe), "protocolRecipient");
        _check(fc.curatorRecipient() == vm.envOr("CURATOR_FEE_RECIPIENT", curator), "curatorRecipient");
        _check(fc.curatorShareWad() <= fc.MAX_CURATOR_SHARE_WAD(), "curatorShare <= 50%");
        uint256 expShare = vm.envOr("EXPECT_CURATOR_FEE_SHARE_WAD", type(uint256).max);
        if (expShare != type(uint256).max) _check(fc.curatorShareWad() == expShare, "curatorShare == expected");
        _check(
            fc.protocolShares() + fc.curatorShares() <= market.supplyShares(address(fc)), "fee ledgers <= shares held"
        );
        console2.log("curatorShareWad", fc.curatorShareWad());
        console2.log("collateral maxDeviationBps", oracle.maxDeviationBps(market.collateralAsset()));
        console2.log("borrow maxDeviationBps", oracle.maxDeviationBps(market.borrowAsset()));

        console2.log("-- params / live state");
        LensReader.MarketSnapshot memory s = lens.snapshot(market);
        console2.log("supplyCap", s.supplyCap);
        console2.log("borrowCap", s.borrowCap);
        console2.log("walletSupplyCap", s.walletSupplyCap);
        console2.log("walletBorrowCap", s.walletBorrowCap);
        console2.log("ltvWad", s.ltvWad);
        console2.log("liquidationThresholdWad", s.liquidationThresholdWad);
        console2.log("liquidationBonusWad", s.liquidationBonusWad);
        console2.log("utilizationWad", s.utilizationWad);
        console2.log("paused", s.paused);
        console2.log("timelock minDelay", tl.getMinDelay());
        _check(s.ltvWad < s.liquidationThresholdWad, "ltv < liquidationThreshold");
        _check(!s.repayPaused, "repay never paused");
        (uint256 cp,,, uint256 cu) = oracle.read(market.collateralAsset());
        (uint256 bp,,, uint256 bu) = oracle.read(market.borrowAsset());
        console2.log("collateral price raw", cp, "updatedAt", cu);
        console2.log("borrow price raw", bp, "updatedAt", bu);

        if (failures > 0) {
            console2.log("FAILURES", failures);
            revert("VerifyDeployment: failures");
        }
        console2.log("ALL CHECKS PASSED");
    }
}
