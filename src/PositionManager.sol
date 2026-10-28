// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IFHEAdapter} from "./interfaces/IFHEAdapter.sol";
import {PrivacyMode} from "./types/PrivacyMode.sol";

/// @title PositionManager
/// @notice One position per user per market. Amounts are written only through IFHEAdapter.
/// @dev Storage layout is part of the G3 migration plan. Do not reorder fields.
///      In G2 every amount word is bytes32(uint256) public plaintext. Reserved words stay zero.
///      See docs/STORAGE-LAYOUT.md for the slot map and the in-place migration rule.
contract PositionManager {
    /// @dev Mapping of positions lives at this slot. Do not insert state variables above it.
    uint256 public constant POSITIONS_MAPPING_SLOT = 0;
    uint256 public constant LAYOUT_VERSION_G2 = 1;

    IFHEAdapter public immutable fhe;
    address public immutable market;

    struct Position {
        // slot 0 (32 bytes, packed low to high): owner, status, privacyMode, openedAt, updatedAt
        address owner;
        uint8 status;
        uint8 privacyMode;
        uint40 openedAt;
        uint40 updatedAt;
        // slot 1: supply shares, public integer packed in a word
        bytes32 supplySharesWord;
        // slots 2-4: reserved for a future 4-word supply handle. Must stay zero in G2.
        bytes32 supplyReserved1;
        bytes32 supplyReserved2;
        bytes32 supplyReserved3;
        // slot 5: collateral token amount (1:1, escrowed, no index). Public integer.
        bytes32 collateralWord;
        // slots 6-8: reserved collateral handle extension
        bytes32 collateralReserved1;
        bytes32 collateralReserved2;
        bytes32 collateralReserved3;
        // slot 9: borrow shares. Public integer.
        bytes32 debtSharesWord;
        // slots 10-12: reserved debt handle extension
        bytes32 debtReserved1;
        bytes32 debtReserved2;
        bytes32 debtReserved3;
        // slot 13: reserved for a future Health Factor handle. Not written in G2.
        bytes32 healthFactorHandle;
        // slot 14: 0 = empty, 1 = G2 plaintext words. Any other version reverts in this contract.
        uint256 layoutVersion;
    }

    struct PositionView {
        address owner;
        uint8 status;
        uint8 privacyMode;
        uint40 openedAt;
        uint40 updatedAt;
        bytes32 supplySharesWord;
        bytes32 supplyReserved1;
        bytes32 supplyReserved2;
        bytes32 supplyReserved3;
        bytes32 collateralWord;
        bytes32 collateralReserved1;
        bytes32 collateralReserved2;
        bytes32 collateralReserved3;
        bytes32 debtSharesWord;
        bytes32 debtReserved1;
        bytes32 debtReserved2;
        bytes32 debtReserved3;
        bytes32 healthFactorHandle;
        uint256 layoutVersion;
        uint256 supplyShares;
        uint256 collateralAssets;
        uint256 debtShares;
    }

    mapping(address user => Position position) private positions;

    error ZeroAddress();
    error OnlyMarket();
    error ZeroAmount();
    error UnsupportedLayout(uint256 version);
    error ReservedSlotDirty();
    error OwnerMismatch();

    modifier onlyMarket() {
        if (msg.sender != market) revert OnlyMarket();
        _;
    }

    constructor(IFHEAdapter fhe_, address market_) {
        if (address(fhe_) == address(0) || market_ == address(0)) revert ZeroAddress();
        fhe = fhe_;
        market = market_;
    }

    function supplyShares(address user) external view returns (uint256) {
        return _decryptReadable(positions[user].supplySharesWord, positions[user]);
    }

    function collateralAssets(address user) external view returns (uint256) {
        return _decryptReadable(positions[user].collateralWord, positions[user]);
    }

    function debtShares(address user) external view returns (uint256) {
        return _decryptReadable(positions[user].debtSharesWord, positions[user]);
    }

    function viewPosition(address user) external view returns (PositionView memory v) {
        Position storage p = positions[user];
        _assertReadable(p);
        v.owner = p.owner;
        v.status = p.status;
        v.privacyMode = p.privacyMode;
        v.openedAt = p.openedAt;
        v.updatedAt = p.updatedAt;
        v.supplySharesWord = p.supplySharesWord;
        v.supplyReserved1 = p.supplyReserved1;
        v.supplyReserved2 = p.supplyReserved2;
        v.supplyReserved3 = p.supplyReserved3;
        v.collateralWord = p.collateralWord;
        v.collateralReserved1 = p.collateralReserved1;
        v.collateralReserved2 = p.collateralReserved2;
        v.collateralReserved3 = p.collateralReserved3;
        v.debtSharesWord = p.debtSharesWord;
        v.debtReserved1 = p.debtReserved1;
        v.debtReserved2 = p.debtReserved2;
        v.debtReserved3 = p.debtReserved3;
        v.healthFactorHandle = p.healthFactorHandle;
        v.layoutVersion = p.layoutVersion;
        v.supplyShares = fhe.decrypt(p.supplySharesWord);
        v.collateralAssets = fhe.decrypt(p.collateralWord);
        v.debtShares = fhe.decrypt(p.debtSharesWord);
    }

    function addSupplyShares(address user, uint256 amount) external onlyMarket returns (uint256 updated) {
        updated = _add(positions[user], user, _Supply, amount);
    }

    function subSupplyShares(address user, uint256 amount) external onlyMarket returns (uint256 updated) {
        updated = _sub(positions[user], user, _Supply, amount);
    }

    function addCollateral(address user, uint256 amount) external onlyMarket returns (uint256 updated) {
        updated = _add(positions[user], user, _Collateral, amount);
    }

    function subCollateral(address user, uint256 amount) external onlyMarket returns (uint256 updated) {
        updated = _sub(positions[user], user, _Collateral, amount);
    }

    function addDebtShares(address user, uint256 amount) external onlyMarket returns (uint256 updated) {
        updated = _add(positions[user], user, _Debt, amount);
    }

    function subDebtShares(address user, uint256 amount) external onlyMarket returns (uint256 updated) {
        updated = _sub(positions[user], user, _Debt, amount);
    }

    uint8 private constant _Supply = 0;
    uint8 private constant _Collateral = 1;
    uint8 private constant _Debt = 2;

    function _add(Position storage p, address user, uint8 kind, uint256 amount) private returns (uint256) {
        if (amount == 0) revert ZeroAmount();
        _open(p, user);
        bytes32 next = fhe.store(fhe.add(_word(p, kind), fhe.encrypt(amount)));
        _setWord(p, kind, next);
        _assertReserved(p);
        return fhe.decrypt(next);
    }

    function _sub(Position storage p, address user, uint8 kind, uint256 amount) private returns (uint256) {
        if (amount == 0) revert ZeroAmount();
        _open(p, user);
        bytes32 next = fhe.store(fhe.sub(_word(p, kind), fhe.encrypt(amount)));
        _setWord(p, kind, next);
        _assertReserved(p);
        return fhe.decrypt(next);
    }

    function _word(Position storage p, uint8 kind) private view returns (bytes32) {
        if (kind == _Supply) return p.supplySharesWord;
        if (kind == _Collateral) return p.collateralWord;
        return p.debtSharesWord;
    }

    function _setWord(Position storage p, uint8 kind, bytes32 next) private {
        if (kind == _Supply) p.supplySharesWord = next;
        else if (kind == _Collateral) p.collateralWord = next;
        else p.debtSharesWord = next;
        p.updatedAt = uint40(block.timestamp);
    }

    function _open(Position storage p, address user) private {
        if (p.layoutVersion == 0) {
            p.owner = user;
            p.status = 1;
            p.privacyMode = uint8(PrivacyMode.Public);
            p.openedAt = uint40(block.timestamp);
            p.layoutVersion = LAYOUT_VERSION_G2;
        } else if (p.layoutVersion != LAYOUT_VERSION_G2) {
            revert UnsupportedLayout(p.layoutVersion);
        }
        if (p.owner != user) revert OwnerMismatch();
        if (p.privacyMode != uint8(PrivacyMode.Public)) revert UnsupportedLayout(p.privacyMode);
        p.updatedAt = uint40(block.timestamp);
        _assertReserved(p);
    }

    function _decryptReadable(bytes32 word, Position storage p) private view returns (uint256) {
        _assertReadable(p);
        return fhe.decrypt(word);
    }

    function _assertReadable(Position storage p) private view {
        if (p.layoutVersion != 0 && p.layoutVersion != LAYOUT_VERSION_G2) revert UnsupportedLayout(p.layoutVersion);
        if (p.layoutVersion == LAYOUT_VERSION_G2 && p.privacyMode != uint8(PrivacyMode.Public)) {
            revert UnsupportedLayout(p.privacyMode);
        }
        _assertReserved(p);
    }

    function _assertReserved(Position storage p) private view {
        if (
            p.supplyReserved1 != 0 || p.supplyReserved2 != 0 || p.supplyReserved3 != 0 || p.collateralReserved1 != 0
                || p.collateralReserved2 != 0 || p.collateralReserved3 != 0 || p.debtReserved1 != 0
                || p.debtReserved2 != 0 || p.debtReserved3 != 0 || p.healthFactorHandle != 0
        ) revert ReservedSlotDirty();
    }
}
