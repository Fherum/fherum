// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {EmergencyController} from "../../src/EmergencyController.sol";
import {LiquidityHub} from "../../src/LiquidityHub.sol";
import {Market} from "../../src/Market.sol";
import {FeeController} from "../../src/FeeController.sol";
import {Math512} from "../../src/libraries/Math512.sol";
import {ValueMath} from "../../src/libraries/ValueMath.sol";
import {MockAggregatorV3} from "../mocks/MockAggregatorV3.sol";
import {MockERC20} from "../mocks/MockERC20.sol";

contract Handler is Test {
    Market public market;
    LiquidityHub public hub;
    EmergencyController public emergency;
    MockERC20 public borrowToken;
    MockERC20 public collateralToken;
    MockAggregatorV3 public borrowFeed;
    MockAggregatorV3 public collateralFeed;
    address public governor;
    address public guardian;
    address public liquidator;
    address[3] public actors;

    uint256 public lastBorrowIndex;
    uint256 public lastSupplyIndex;
    FeeController public feeController;
    /// @dev Ghost counters for the INVARIANTS.md post-liquidation and oracle-free claims.
    uint256 public ghostTargetViolations;
    uint256 public ghostFullLiquidations;
    uint256 public ghostOracleFreeFailures;

    constructor(
        Market market_,
        LiquidityHub hub_,
        EmergencyController emergency_,
        MockERC20 borrowToken_,
        MockERC20 collateralToken_,
        MockAggregatorV3 borrowFeed_,
        MockAggregatorV3 collateralFeed_,
        address governor_,
        address guardian_,
        address liquidator_,
        address alice,
        address bob,
        address carol
    ) {
        market = market_;
        hub = hub_;
        emergency = emergency_;
        borrowToken = borrowToken_;
        collateralToken = collateralToken_;
        borrowFeed = borrowFeed_;
        collateralFeed = collateralFeed_;
        governor = governor_;
        guardian = guardian_;
        liquidator = liquidator_;
        actors[0] = alice;
        actors[1] = bob;
        actors[2] = carol;
        lastBorrowIndex = market.borrowIndex();
        lastSupplyIndex = market.supplyIndex();
    }

    function supply(uint256 seed, uint256 amount) external {
        _fresh();
        amount = bound(amount, 1e15, 1e22);
        vm.prank(_actor(seed));
        try market.supply(amount) {} catch {}
        _after();
    }

    function withdraw(uint256 seed, uint256 amount) external {
        _fresh();
        address user = _actor(seed);
        uint256 shares = market.supplyShares(user);
        uint256 idx = market.supplyIndex();
        uint256 userAssets = shares == 0 ? 0 : (shares * idx) / 1e27;
        uint256 avail = market.availableLiquidity();
        uint256 maxOut = userAssets < avail ? userAssets : avail;
        if (maxOut > 0) {
            amount = bound(amount, 1, maxOut);
            vm.prank(user);
            try market.withdraw(amount) {} catch {}
        }
        _after();
    }

    function addCollateral(uint256 seed, uint256 amount) external {
        _fresh();
        amount = bound(amount, 1e15, 1e22);
        vm.prank(_actor(seed));
        try market.addCollateral(amount) {} catch {}
        _after();
    }

    function removeCollateral(uint256 seed, uint256 amount) external {
        _fresh();
        address user = _actor(seed);
        uint256 coll = market.collateralAssets(user);
        if (coll > 0) {
            amount = bound(amount, 1, coll);
            vm.prank(user);
            try market.removeCollateral(amount) {
                assertGe(market.healthFactorWad(user), 1e18);
            } catch {}
        }
        _after();
    }

    function borrow(uint256 seed, uint256 amount) external {
        _fresh();
        address user = _actor(seed);
        uint256 coll = market.collateralAssets(user);
        if (coll > 0) {
            uint256 guess = coll / 2;
            if (guess == 0) guess = 1;
            amount = bound(amount, 1, guess);
            vm.prank(user);
            try market.borrow(amount) {
                assertGe(market.healthFactorWad(user), 1e18);
            } catch {}
        }
        _after();
    }

    function repay(uint256 seed, uint256 amount) external {
        _fresh();
        address user = _actor(seed);
        uint256 debt = market.debtAssets(user);
        if (debt > 0) {
            amount = bound(amount, 1, debt);
            vm.prank(user);
            try market.repay(user, amount) {} catch {}
        }
        _after();
    }

    function liquidate(uint256 seed, uint256 amount) external {
        _fresh();
        address user = _actor(seed);
        uint256 debt = market.debtAssets(user);
        if (debt == 0) {
            _after();
            return;
        }
        collateralFeed.setAnswer(5e7);
        amount = bound(amount, 1, debt);
        uint256 borrowBefore = borrowToken.balanceOf(liquidator);
        uint256 collBefore = collateralToken.balanceOf(liquidator);
        vm.prank(liquidator);
        try market.liquidate(user, amount) {
            uint256 spent = borrowBefore - borrowToken.balanceOf(liquidator);
            uint256 seized = collateralToken.balanceOf(liquidator) - collBefore;
            uint256 repayValue = ValueMath.toValueWad(spent, 1e8, 8, 18, Math.Rounding.Floor);
            uint256 seizeValue = ValueMath.toValueWad(seized, 5e7, 8, 18, Math.Rounding.Floor);
            assertTrue(Math512.mulGte(repayValue, market.liquidationBonusWad(), seizeValue, 1e18));
        } catch {}
        collateralFeed.setAnswer(1e8);
        _after();
    }

    function setFeeController(FeeController fc) external {
        require(address(feeController) == address(0), "set");
        feeController = fc;
    }

    /// @dev Max-request liquidation: afterwards HF >= target unless a cap bound (close factor, collateral
    ///      exhausted, or debt fully repaid / dust rule).
    function liquidateMax(uint256 seed) external {
        _fresh();
        address user = _actor(seed);
        uint256 debt = market.debtAssets(user);
        if (debt == 0) {
            _after();
            return;
        }
        // Push HF to ~0.95 so the position is liquidatable but the target is usually reachable.
        // A fixed 50% drop left most positions above HF 1 and made this handler vacuous.
        uint256 hf0 = market.healthFactorWad(user);
        int256 px = int256(uint256(1e8) * 0.95e18 / hf0);
        collateralFeed.setAnswer(px > 0 ? px : int256(1));
        uint256 debtBefore = market.debtAssets(user);
        uint256 closeCap = debtBefore * market.closeFactorWad() / 1e18;
        vm.prank(liquidator);
        try market.liquidate(user, type(uint128).max) {
            ghostFullLiquidations++;
            uint256 debtAfter = market.debtAssets(user);
            uint256 repaid = debtBefore - debtAfter;
            bool capped = repaid + 2 >= closeCap || market.collateralAssets(user) == 0 || debtAfter == 0;
            if (!capped) {
                uint256 hf = market.healthFactorWad(user);
                // 1e-9 relative tolerance for share rounding.
                if (hf + market.targetHealthFactorWad() / 1e9 < market.targetHealthFactorWad()) {
                    ghostTargetViolations++;
                }
            }
        } catch {}
        collateralFeed.setAnswer(1e8);
        _after();
    }

    /// @dev Both feeds stale (and a garbage answer): repay and addCollateral must still succeed.
    function staleOracleRepayAddCollateral(uint256 seed, uint256 amount) external {
        address user = _actor(seed);
        vm.warp(block.timestamp + 2 days);
        borrowFeed.setUpdatedAt(1);
        collateralFeed.setUpdatedAt(1);
        vm.prank(user);
        try market.addCollateral(1e15) {}
        catch {
            ghostOracleFreeFailures++;
        }
        uint256 debt = market.debtAssets(user);
        if (debt > 1) {
            amount = bound(amount, 1, debt);
            vm.prank(user);
            try market.repay(user, amount) {}
            catch (bytes memory reason) {
                // RepayTooSmall/NoDebt are amount-rounding rejections, not oracle reads.
                bytes4 sel = bytes4(reason);
                if (sel != Market.RepayTooSmall.selector && sel != Market.NoDebt.selector) ghostOracleFreeFailures++;
            }
        }
        _fresh();
        _after();
    }

    function distributeFees() external {
        _fresh();
        if (address(feeController) != address(0)) feeController.distribute();
        _after();
    }

    function warp(uint256 dt) external {
        dt = bound(dt, 1, 30 days);
        uint256 borrowBefore = market.borrowIndex();
        uint256 supplyBefore = market.supplyIndex();
        vm.warp(block.timestamp + dt);
        _fresh();
        try market.accrue() {
            assertGe(market.borrowIndex(), borrowBefore);
            assertGe(market.supplyIndex(), supplyBefore);
        } catch {
            assertTrue(false, "accrue reverted");
        }
        _after();
    }

    function pauseRepayUnpause(uint256 seed) external {
        _fresh();
        address user = _actor(seed);
        vm.prank(guardian);
        emergency.pause(address(market));

        vm.prank(user);
        try market.borrow(1) {
            assertTrue(false, "borrow succeeded while paused");
        } catch {}

        vm.prank(user);
        try market.removeCollateral(1) {
            assertTrue(false, "collateral withdraw succeeded while paused");
        } catch {}

        uint256 debt = market.debtAssets(user);
        if (debt > 0) {
            vm.prank(user);
            try market.repay(user, debt) {}
            catch {
                assertTrue(false, "repay reverted while paused");
            }
        }

        vm.prank(governor);
        emergency.unpause(address(market));
        _after();
    }

    function _actor(uint256 seed) internal view returns (address) {
        return actors[seed % actors.length];
    }

    function _fresh() internal {
        borrowFeed.setUpdatedAt(block.timestamp);
        collateralFeed.setUpdatedAt(block.timestamp);
    }

    function _after() internal {
        uint256 borrowIndex = market.borrowIndex();
        uint256 supplyIndex = market.supplyIndex();
        assertGe(borrowIndex, lastBorrowIndex);
        assertGe(supplyIndex, lastSupplyIndex);
        assertGe(borrowIndex, 1e27);
        assertGe(supplyIndex, 1e27);
        lastBorrowIndex = borrowIndex;
        lastSupplyIndex = supplyIndex;

        uint256 cash = hub.cashOf(address(market), address(borrowToken), LiquidityHub.BucketKind.Liquidity);
        assertGe(cash + market.totalDebtAssets(), market.totalSupplyAssets());
        assertLe(
            hub.principalDrawn(address(market), address(borrowToken)),
            hub.creditLimit(address(market), address(borrowToken))
        );
    }
}
