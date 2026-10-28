// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IFHEAdapter} from "./interfaces/IFHEAdapter.sol";
import {Math512} from "./libraries/Math512.sol";

/// @title PlaintextFHEAdapter
/// @notice G2 stand-in for a future vendor FHE adapter. Words are packed public integers.
/// @dev This word is not ciphertext. `encrypt` stores `bytes32(plaintext)` and `decrypt` reads it back.
///      `isEncrypted` is unconditionally false. `encryptionAvailable` is unconditionally false.
///      `refuseCiphertextLabel` always reverts so no caller can treat a word as a ciphertext handle.
///      Robinhood Chain 4663/46630 has no live FHE stack in this release (G1 NO-GO, 2026-10-28).
contract PlaintextFHEAdapter is IFHEAdapter {
    error Underflow();
    error InconsistentCompare();
    error RefusingToLabelPlaintextAsCiphertext();

    uint256 internal constant MAX_UINT = type(uint256).max;

    function encrypt(uint256 plaintext) public view returns (bytes32 word) {
        if (isEncrypted(bytes32(plaintext))) revert RefusingToLabelPlaintextAsCiphertext();
        word = bytes32(plaintext);
    }

    function store(bytes32 word) public view returns (bytes32 stored) {
        if (isEncrypted(word)) revert RefusingToLabelPlaintextAsCiphertext();
        stored = word;
    }

    function add(bytes32 a, bytes32 b) public view returns (bytes32) {
        return store(bytes32(decrypt(a) + decrypt(b)));
    }

    function sub(bytes32 a, bytes32 b) public view returns (bytes32) {
        uint256 av = decrypt(a);
        uint256 bv = decrypt(b);
        if (av < bv) revert Underflow();
        return store(bytes32(av - bv));
    }

    function mulByPlaintext(bytes32 a, uint256 scalar) public view returns (bytes32) {
        return store(bytes32(decrypt(a) * scalar));
    }

    function decrypt(bytes32 word) public view returns (uint256 plaintext) {
        if (isEncrypted(word)) revert RefusingToLabelPlaintextAsCiphertext();
        plaintext = uint256(word);
    }

    function compareLt(bytes32 a, bytes32 b) external view returns (bool) {
        return decrypt(a) < decrypt(b);
    }

    function compareLte(bytes32 a, bytes32 b) external view returns (bool) {
        return decrypt(a) <= decrypt(b);
    }

    function compareGte(bytes32 a, bytes32 b) external view returns (bool) {
        return decrypt(a) >= decrypt(b);
    }

    function productGte(bytes32 a, uint256 aScale, bytes32 b, uint256 bScale) external view returns (bool) {
        uint256 av = decrypt(a);
        uint256 bv = decrypt(b);
        bool wide = Math512.mulGte(av, aScale, bv, bScale);
        if (_productFits(av, aScale) && _productFits(bv, bScale)) {
            bool narrow = decrypt(mulByPlaintext(a, aScale)) >= decrypt(mulByPlaintext(b, bScale));
            if (narrow != wide) revert InconsistentCompare();
        }
        return wide;
    }

    /// @inheritdoc IFHEAdapter
    function isEncrypted(bytes32) public pure returns (bool) {
        return false;
    }

    function encryptionAvailable() external pure returns (bool) {
        return false;
    }

    function privacyLabel() external pure returns (string memory) {
        return "public-plaintext";
    }

    function refuseCiphertextLabel(bytes32) external pure {
        revert RefusingToLabelPlaintextAsCiphertext();
    }

    function _productFits(uint256 value, uint256 scalar) internal pure returns (bool) {
        return scalar == 0 || value <= MAX_UINT / scalar;
    }
}
