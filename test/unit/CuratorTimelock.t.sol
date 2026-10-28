// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Vm} from "forge-std/Vm.sol";
import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";
import {Market} from "../../src/Market.sol";
import {CuratorRegistry} from "../../src/CuratorRegistry.sol";
import {IEligibilityAdapter} from "../../src/interfaces/IEligibilityAdapter.sol";
import {G4Fixture} from "../utils/G4Fixture.sol";

contract CuratorTimelockTest is G4Fixture {
    bytes32 internal constant UPDATE_QUEUED = keccak256("UpdateQueued(bytes32,address,bytes4,uint256)");
    bytes32 internal constant UPDATE_EXECUTED = keccak256("UpdateExecuted(bytes32,address)");
    bytes32 internal constant UPDATE_CANCELLED = keccak256("UpdateCancelled(bytes32,address)");
    bytes32 internal constant CALL_SCHEDULED =
        keccak256("CallScheduled(bytes32,uint256,address,uint256,bytes,bytes32,uint256)");
    bytes32 internal constant CALL_EXECUTED = keccak256("CallExecuted(bytes32,uint256,address,uint256,bytes)");
    bytes32 internal constant CANCELLED = keccak256("Cancelled(bytes32)");

    function test_factoryMarketIsOwnedByTheTimelock() public {
        Market spoke = _createCuratedMarket();

        assertTrue(hub.isSpoke(address(spoke)));
        assertTrue(registry.isMarket(address(spoke)));
        assertEq(hub.creditLimit(address(spoke), address(borrowToken)), 800_000e18);
        assertTrue(spoke.hasRole(spoke.CURATOR_ROLE(), address(timelock)));
        assertTrue(spoke.hasRole(spoke.DEFAULT_ADMIN_ROLE(), address(timelock)));
        assertFalse(spoke.hasRole(spoke.CURATOR_ROLE(), curator));
        assertFalse(spoke.hasRole(spoke.CURATOR_ROLE(), governor));
        assertFalse(spoke.hasRole(spoke.CURATOR_ROLE(), guardian));
        assertFalse(spoke.hasRole(spoke.DEFAULT_ADMIN_ROLE(), governor));
        assertEq(uint8(spoke.privacyMode()), 0);
        assertEq(address(spoke.eligibility()), address(0));

        assertTrue(timelock.hasRole(timelock.PROPOSER_ROLE(), address(registry)));
        assertTrue(timelock.hasRole(timelock.CANCELLER_ROLE(), address(registry)));
        assertTrue(timelock.hasRole(timelock.EXECUTOR_ROLE(), address(0)));
        assertFalse(timelock.hasRole(timelock.PROPOSER_ROLE(), address(forgeAdmin)));
        assertFalse(timelock.hasRole(timelock.PROPOSER_ROLE(), curator));
        assertFalse(timelock.hasRole(timelock.PROPOSER_ROLE(), guardian));
        assertFalse(timelock.hasRole(timelock.DEFAULT_ADMIN_ROLE(), address(forgeAdmin)));
        assertFalse(registry.hasRole(registry.CURATOR_ROLE(), guardian));
        assertFalse(registry.hasRole(registry.DEFAULT_ADMIN_ROLE(), guardian));
        assertFalse(registry.hasRole(registry.DEFAULT_ADMIN_ROLE(), curator));
    }

    function test_queueCannotExecuteEarlyThenExecutes() public {
        Market spoke = _createCuratedMarket();
        uint256 ltv = 0.7e18;
        bytes memory data = abi.encodeCall(Market.setRiskParams, (ltv, 0.85e18, 1.05e18, 0.5e18, 0.1e18, 100e18));
        bytes32 salt = bytes32(registry.nonce());
        bytes32 id = timelock.hashOperation(address(spoke), 0, data, bytes32(0), salt);
        uint256 eta = block.timestamp + timelock.getMinDelay();

        vm.recordLogs();
        vm.prank(curator);
        bytes32 returned = registry.queueRiskParams(address(spoke), ltv, 0.85e18, 1.05e18, 0.5e18, 0.1e18, 100e18);
        assertEq(returned, id, "id");
        _assertQueued(bytes32(Market.setRiskParams.selector));
        assertEq(timelock.getTimestamp(id), eta, "eta");
        assertTrue(timelock.isOperationPending(id), "pending");
        assertFalse(timelock.isOperationReady(id), "ready early");

        vm.warp(eta - 1);
        vm.expectRevert();
        registry.execute(id);
        assertEq(spoke.ltvWad(), 0.75e18);

        vm.warp(eta);
        assertTrue(timelock.isOperationReady(id), "ready");
        vm.recordLogs();
        vm.prank(alice);
        registry.execute(id);
        _assertLogged(UPDATE_EXECUTED, CALL_EXECUTED);
        assertEq(spoke.ltvWad(), ltv);
        assertTrue(timelock.isOperationDone(id));

        vm.expectRevert(abi.encodeWithSelector(CuratorRegistry.UnknownOperation.selector, id));
        registry.execute(id);
    }

    function test_unauthorizedCannotQueueOrSetRisk() public {
        Market spoke = _createCuratedMarket();

        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector, alice, registry.CURATOR_ROLE()
            )
        );
        vm.prank(alice);
        registry.queueRiskParams(address(spoke), 0.7e18, 0.85e18, 1.05e18, 0.5e18, 0.1e18, 100e18);

        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector, guardian, registry.CURATOR_ROLE()
            )
        );
        vm.prank(guardian);
        registry.queueCaps(address(spoke), 1, 1, 1, 1);

        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector, curator, timelock.PROPOSER_ROLE()
            )
        );
        vm.prank(curator);
        timelock.schedule(address(spoke), 0, "", bytes32(0), bytes32(uint256(99)), MIN_DELAY);

        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector, curator, spoke.CURATOR_ROLE()
            )
        );
        vm.prank(curator);
        spoke.setRiskParams(0.7e18, 0.85e18, 1.05e18, 0.5e18, 0.1e18, 100e18);

        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector, governor, spoke.CURATOR_ROLE()
            )
        );
        vm.prank(governor);
        spoke.setCaps(1, 1, 1, 1);

        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector, guardian, spoke.DEFAULT_ADMIN_ROLE()
            )
        );
        vm.prank(guardian);
        spoke.setFeeRecipient(guardian);
    }

    function test_cancelEmitsAndBlocksExecute() public {
        Market spoke = _createCuratedMarket();
        vm.prank(curator);
        bytes32 id = registry.queueRateParams(address(spoke), 0.01e18, 0.04e18, 0.75e18, 0.8e18);

        vm.expectRevert(abi.encodeWithSelector(CuratorRegistry.NotCanceller.selector, guardian));
        vm.prank(guardian);
        registry.cancel(id);

        vm.expectRevert(abi.encodeWithSelector(CuratorRegistry.NotCanceller.selector, alice));
        vm.prank(alice);
        registry.cancel(id);

        vm.recordLogs();
        vm.prank(governor);
        registry.cancel(id);
        _assertLogged(UPDATE_CANCELLED, CANCELLED);
        assertFalse(timelock.isOperationPending(id));

        vm.warp(block.timestamp + MIN_DELAY);
        vm.expectRevert(abi.encodeWithSelector(CuratorRegistry.UnknownOperation.selector, id));
        registry.execute(id);
        (uint256 baseRate,,,) = spoke.rateParams();
        assertEq(baseRate, 0);
    }

    function test_curatorCanCancelOwnQueue() public {
        Market spoke = _createCuratedMarket();
        vm.prank(curator);
        bytes32 id = registry.queueCaps(address(spoke), 10e18, 10e18, 10e18, 10e18);
        vm.prank(curator);
        registry.cancel(id);
        (address recorded,,) = registry.operationOf(id);
        assertEq(recorded, address(0));
    }

    function test_adminQueuesEligibilityAndFeeRecipient() public {
        Market spoke = _createCuratedMarket();

        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector, curator, registry.DEFAULT_ADMIN_ROLE()
            )
        );
        vm.prank(curator);
        registry.queueEligibility(address(spoke), IEligibilityAdapter(address(eligibility)));

        vm.prank(governor);
        bytes32 gateId = registry.queueEligibility(address(spoke), IEligibilityAdapter(address(eligibility)));
        _execute(gateId);
        assertEq(address(spoke.eligibility()), address(eligibility));

        address nextTreasury = makeAddr("nextTreasury");
        vm.prank(governor);
        bytes32 feeId = registry.queueFeeRecipient(address(spoke), nextTreasury);
        _execute(feeId);
        assertEq(spoke.feeRecipient(), nextTreasury);
    }

    function test_unregisteredMarketAndDirectCuratorMarketStillWorks() public {
        vm.prank(curator);
        vm.expectRevert(abi.encodeWithSelector(CuratorRegistry.UnknownMarket.selector, address(market)));
        registry.queueRiskParams(address(market), 0.7e18, 0.85e18, 1.05e18, 0.5e18, 0.1e18, 100e18);

        vm.prank(curator);
        market.setRiskParams(0.7e18, 0.85e18, 1.05e18, 0.5e18, 0.1e18, 100e18);
        assertEq(market.ltvWad(), 0.7e18);
    }

    function testFuzz_executeOnlyAfterDelay(uint32 early) public {
        early = uint32(bound(early, 0, MIN_DELAY - 1));
        Market spoke = _createCuratedMarket();
        vm.prank(curator);
        bytes32 id = registry.queueRiskParams(address(spoke), 0.7e18, 0.85e18, 1.05e18, 0.5e18, 0.1e18, 100e18);
        uint256 eta = timelock.getTimestamp(id);
        vm.warp(block.timestamp + early);
        vm.expectRevert();
        registry.execute(id);
        assertEq(spoke.ltvWad(), 0.75e18);
        vm.warp(eta);
        registry.execute(id);
        assertEq(spoke.ltvWad(), 0.7e18);
    }

    function _execute(bytes32 id) internal {
        uint256 eta = timelock.getTimestamp(id);
        vm.warp(eta - 1);
        vm.expectRevert();
        registry.execute(id);
        vm.warp(eta);
        registry.execute(id);
    }

    function _assertQueued(bytes32 selector) internal view {
        Vm.Log[] memory logs = vm.getRecordedLogs();
        bool queued;
        bool scheduled;
        bytes32 foundSelector;
        for (uint256 i = 0; i < logs.length; i++) {
            if (logs[i].topics.length == 0) continue;
            if (logs[i].topics[0] == UPDATE_QUEUED) {
                queued = true;
                foundSelector = logs[i].topics[3];
            }
            if (logs[i].topics[0] == CALL_SCHEDULED) scheduled = true;
        }
        assertTrue(queued, "missing queue event");
        assertTrue(scheduled, "missing schedule event");
        assertEq(foundSelector, selector, "selector");
    }

    function _assertLogged(bytes32 first, bytes32 second) internal view {
        Vm.Log[] memory logs = vm.getRecordedLogs();
        bool foundFirst;
        bool foundSecond;
        for (uint256 i = 0; i < logs.length; i++) {
            if (logs[i].topics.length == 0) continue;
            if (logs[i].topics[0] == first) foundFirst = true;
            if (logs[i].topics[0] == second) foundSecond = true;
        }
        assertTrue(foundFirst, "missing first event");
        assertTrue(foundSecond, "missing second event");
    }
}
