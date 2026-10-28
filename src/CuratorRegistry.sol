// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {TimelockController} from "@openzeppelin/contracts/governance/TimelockController.sol";
import {IEligibilityAdapter} from "./interfaces/IEligibilityAdapter.sol";
import {Market} from "./Market.sol";

/// @title CuratorRegistry
/// @notice Queues market risk-parameter changes on an OpenZeppelin timelock and records queue, execute, and cancel.
/// @dev The registry holds `PROPOSER_ROLE` and `CANCELLER_ROLE` on the timelock. The timelock holds
///      `CURATOR_ROLE` on factory markets, so `setRiskParams`, `setCaps`, and `setRateParams` run only
///      after the delay. Guardian has no role here. Execution is permissionless once the operation is ready,
///      because the timelock grants the open executor role to `address(0)`.
contract CuratorRegistry is AccessControl, ReentrancyGuard {
    bytes32 public constant CURATOR_ROLE = keccak256("CURATOR_ROLE");
    bytes32 public constant REGISTRAR_ROLE = keccak256("REGISTRAR_ROLE");

    TimelockController public immutable timelock;

    mapping(address market => bool registered) public isMarket;
    mapping(bytes32 id => Operation operation) private _operations;
    uint256 public nonce = 1;

    struct Operation {
        address market;
        bytes32 salt;
        bytes data;
    }

    event MarketRegistered(address indexed market);
    event UpdateQueued(bytes32 indexed id, address indexed market, bytes4 indexed selector, uint256 eta);
    event UpdateExecuted(bytes32 indexed id, address indexed market);
    event UpdateCancelled(bytes32 indexed id, address indexed caller);

    error ZeroAddress();
    error NotAContract(address market);
    error AlreadyRegistered(address market);
    error UnknownMarket(address market);
    error UnknownOperation(bytes32 id);
    error NotCanceller(address caller);

    constructor(address admin, address curator, TimelockController timelock_) {
        if (admin == address(0) || curator == address(0) || address(timelock_) == address(0)) revert ZeroAddress();
        timelock = timelock_;
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(CURATOR_ROLE, curator);
    }

    function registerMarket(address market) external onlyRole(REGISTRAR_ROLE) {
        if (market == address(0)) revert ZeroAddress();
        if (market.code.length == 0) revert NotAContract(market);
        if (isMarket[market]) revert AlreadyRegistered(market);
        isMarket[market] = true;
        emit MarketRegistered(market);
    }

    function queueRiskParams(
        address market,
        uint256 ltv,
        uint256 liquidationThreshold,
        uint256 bonus,
        uint256 closeFactor,
        uint256 reserveFactor,
        uint256 dust
    ) external onlyRole(CURATOR_ROLE) returns (bytes32 id) {
        bytes memory data =
            abi.encodeCall(Market.setRiskParams, (ltv, liquidationThreshold, bonus, closeFactor, reserveFactor, dust));
        id = _queue(market, data);
    }

    function queueCaps(
        address market,
        uint256 supplyCap,
        uint256 borrowCap,
        uint256 walletSupplyCap,
        uint256 walletBorrowCap
    ) external onlyRole(CURATOR_ROLE) returns (bytes32 id) {
        bytes memory data = abi.encodeCall(Market.setCaps, (supplyCap, borrowCap, walletSupplyCap, walletBorrowCap));
        id = _queue(market, data);
    }

    function queueRateParams(address market, uint256 baseRate, uint256 slope1, uint256 slope2, uint256 optimalUtil)
        external
        onlyRole(CURATOR_ROLE)
        returns (bytes32 id)
    {
        bytes memory data = abi.encodeCall(Market.setRateParams, (baseRate, slope1, slope2, optimalUtil));
        id = _queue(market, data);
    }

    /// @notice Admin path for the entry gate. Passing the zero adapter clears it when the timelock executes.
    function queueEligibility(address market, IEligibilityAdapter adapter)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
        returns (bytes32 id)
    {
        bytes memory data = abi.encodeCall(Market.setEligibility, (adapter));
        id = _queue(market, data);
    }

    function queueFeeRecipient(address market, address recipient)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
        returns (bytes32 id)
    {
        if (recipient == address(0)) revert ZeroAddress();
        bytes memory data = abi.encodeCall(Market.setFeeRecipient, (recipient));
        id = _queue(market, data);
    }

    /// @notice Permissionless after the timelock delay. Reverts while the operation is still waiting.
    function execute(bytes32 id) external nonReentrant {
        Operation memory operation = _operations[id];
        if (operation.market == address(0)) revert UnknownOperation(id);
        delete _operations[id];
        timelock.execute(operation.market, 0, operation.data, bytes32(0), operation.salt);
        emit UpdateExecuted(id, operation.market);
    }

    /// @notice Safe admin or curator may cancel. Guardian cannot.
    function cancel(bytes32 id) external nonReentrant {
        if (!hasRole(DEFAULT_ADMIN_ROLE, msg.sender) && !hasRole(CURATOR_ROLE, msg.sender)) {
            revert NotCanceller(msg.sender);
        }
        Operation memory operation = _operations[id];
        if (operation.market == address(0)) revert UnknownOperation(id);
        delete _operations[id];
        timelock.cancel(id);
        emit UpdateCancelled(id, msg.sender);
    }

    function operationOf(bytes32 id) external view returns (address market, bytes32 salt, bytes memory data) {
        Operation memory operation = _operations[id];
        return (operation.market, operation.salt, operation.data);
    }

    function _queue(address market, bytes memory data) internal returns (bytes32 id) {
        if (!isMarket[market]) revert UnknownMarket(market);
        bytes32 salt = bytes32(nonce);
        nonce = nonce + 1;
        id = timelock.hashOperation(market, 0, data, bytes32(0), salt);
        uint256 delay = timelock.getMinDelay();
        timelock.schedule(market, 0, data, bytes32(0), salt, delay);
        _operations[id] = Operation({market: market, salt: salt, data: data});
        emit UpdateQueued(id, market, _selector(data), block.timestamp + delay);
    }

    function _selector(bytes memory data) internal pure returns (bytes4 selector) {
        uint256 word = uint8(data[0]);
        word = (word << 8) | uint8(data[1]);
        word = (word << 8) | uint8(data[2]);
        word = (word << 8) | uint8(data[3]);
        selector = bytes4(uint32(word));
    }
}
