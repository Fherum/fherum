// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {AddMarket} from "../../script/AddMarket.s.sol";
import {Market} from "../../src/Market.sol";
import {FeeController} from "../../src/FeeController.sol";
import {OracleAdapter} from "../../src/OracleAdapter.sol";
import {LiquidityHub} from "../../src/LiquidityHub.sol";
import {MarketFactory} from "../../src/MarketFactory.sol";

/// @notice Mainnet-fork rehearsal of script/AddMarket.s.sol for TSLA/USDG (no broadcast).
///         Run: FORK_URL=https://robinhood.drpc.org forge test --match-contract AddMarketFork -vv
contract AddMarketForkTest is Test {
    address constant SAFE = 0x3E7CEd699783751FBc7eb1545144DCe6C64D38CB;
    address constant TSLA = 0x322F0929c4625eD5bAd873c95208D54E1c003b2d;
    address constant TSLA_FEED = 0x4A1166a659A55625345e9515b32adECea5547C38;
    address constant USDG = 0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168;
    OracleAdapter constant ORACLE = OracleAdapter(0x4572B9F17C9052fDAB5691f0dFbF0715dd60F9dE);
    LiquidityHub constant HUB = LiquidityHub(0x7A7FfDFBB89C296106dA1A85B6fb13F27Ca357d8);
    MarketFactory constant FACTORY = MarketFactory(0x16A295d143CeB63371078bFDf0681dBBeBff547a);

    function setUp() public {
        string memory url = vm.envOr("FORK_URL", string(""));
        if (bytes(url).length == 0) vm.skip(true);
        vm.createSelectFork(url);
    }

    function test_addTslaMarket_endToEnd() public {
        vm.setEnv("CONFIRM_MAINNET", "yes");
        vm.setEnv("COLLATERAL", vm.toString(TSLA));
        vm.setEnv("COLLATERAL_FEED", vm.toString(TSLA_FEED));
        vm.setEnv("COLLATERAL_MAX_ANSWER", "500000000000"); // $5,000
        (Market m, FeeController fee) = new AddMarket().run();
        assertEq(m.feeRecipient(), address(fee));
        assertEq(m.collateralAsset(), TSLA);

        vm.startPrank(SAFE);
        ORACLE.setFeed(TSLA, TSLA_FEED, 18, 25 hours, 500_000_000_000);
        ORACLE.setMaxDeviation(TSLA, 1500);
        HUB.setAssetAllowed(TSLA, true);
        FACTORY.registerMarket(m, 1_000e6);
        vm.stopPrank();

        address lp = makeAddr("lp");
        address bob = makeAddr("bob");
        deal(USDG, lp, 500e6);
        deal(TSLA, bob, 1e18);

        vm.startPrank(lp);
        IERC20(USDG).approve(address(m), 500e6);
        m.supply(500e6);
        vm.stopPrank();

        vm.startPrank(bob);
        IERC20(TSLA).approve(address(m), 1e18);
        m.addCollateral(1e18);
        m.borrow(100e6); // ~$358 collateral, LTV 50% => ~$179 max
        vm.expectRevert();
        m.borrow(100e6); // would exceed LTV
        vm.stopPrank();

        assertEq(IERC20(USDG).balanceOf(bob), 100e6);

        // Weekend: feed stops, oracle fails closed for borrow; repay still works.
        vm.warp(block.timestamp + 3 days);
        vm.prank(bob);
        vm.expectRevert();
        m.borrow(1e6);
        vm.startPrank(bob);
        IERC20(USDG).approve(address(m), type(uint256).max);
        m.repay(bob, 50e6);
        vm.stopPrank();
    }
}
