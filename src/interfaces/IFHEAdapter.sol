// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @notice Boundary for position arithmetic that a future vendor adapter may implement.
/// @dev G2's only implementation is PlaintextFHEAdapter. Every function here operates on public
///      integers packed into bytes32. Nothing in this interface returns a ciphertext, and
///      `isEncrypted` is required to stay false until a reviewed vendor adapter is deployed
///      on Robinhood Chain. Encryption, if it ever exists, is not performed by these view stubs.
///
///      A vendor adapter that must write ACL state or consume client-side handles will be a new
///      contract behind the same function names only where the semantics match. Do not reuse a
///      plaintext word as a ciphertext handle. See docs/STORAGE-LAYOUT.md.
interface IFHEAdapter {
    /// @notice Pack a public integer. This is not encryption.
    function encrypt(uint256 plaintext) external view returns (bytes32 word);

    /// @notice Echo a word. Persistence is the caller's storage write. This is not ciphertext storage.
    function store(bytes32 word) external view returns (bytes32 stored);

    function add(bytes32 a, bytes32 b) external view returns (bytes32);

    function sub(bytes32 a, bytes32 b) external view returns (bytes32);

    /// @notice Multiply a packed integer by a public scalar. Reverts on overflow.
    function mulByPlaintext(bytes32 a, uint256 scalar) external view returns (bytes32);

    /// @notice Read the public integer back. This is not decryption of a ciphertext.
    function decrypt(bytes32 word) external view returns (uint256 plaintext);

    function compareLt(bytes32 a, bytes32 b) external view returns (bool);

    function compareLte(bytes32 a, bytes32 b) external view returns (bool);

    function compareGte(bytes32 a, bytes32 b) external view returns (bool);

    /// @dev True when `a * aScale >= b * bScale` over 512-bit products.
    function productGte(bytes32 a, uint256 aScale, bytes32 b, uint256 bScale) external view returns (bool);

    /// @notice Always false in G2. A true result would mean this adapter is claiming ciphertext.
    function isEncrypted(bytes32 word) external view returns (bool);

    /// @notice Always false in G2. Live FHE is not available on Robinhood Chain in this release.
    function encryptionAvailable() external view returns (bool);

    /// @notice Human-readable posture. G2 returns "public-plaintext".
    function privacyLabel() external view returns (string memory);

    /// @notice Always reverts. There is no supported way to label a G2 word as ciphertext.
    function refuseCiphertextLabel(bytes32 word) external view;
}
