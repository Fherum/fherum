// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {MerkleProof} from "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import {IEligibilityAdapter} from "./interfaces/IEligibilityAdapter.sol";

/// @title AllowlistEligibility
/// @notice Per-market address allowlist. A user is eligible after a curator writes the address or after a Merkle claim.
/// @dev The market calls `isEligible` with a staticcall. This contract does not move tokens.
///      Leaf preimage is `keccak256(bytes.concat(keccak256(abi.encode(market, user))))`.
///      Sibling pairs are sorted, matching OpenZeppelin's commutative Merkle proof.
contract AllowlistEligibility is AccessControl, IEligibilityAdapter {
    bytes32 public constant CURATOR_ROLE = keccak256("CURATOR_ROLE");

    mapping(address market => mapping(address user => bool allowed)) public allowed;
    mapping(address market => bytes32 root) public merkleRoot;

    event AllowedSet(address indexed market, address indexed user, bool allowed);
    event MerkleRootSet(address indexed market, bytes32 root);
    event EligibilityClaimed(address indexed market, address indexed user);

    error ZeroAddress();
    error InvalidProof();

    constructor(address admin, address curator) {
        if (admin == address(0) || curator == address(0)) revert ZeroAddress();
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(CURATOR_ROLE, curator);
    }

    function isEligible(address market, address user) external view returns (bool) {
        return allowed[market][user];
    }

    function setAllowed(address market, address user, bool isAllowed) external onlyRole(CURATOR_ROLE) {
        if (market == address(0) || user == address(0)) revert ZeroAddress();
        allowed[market][user] = isAllowed;
        emit AllowedSet(market, user, isAllowed);
    }

    function setMerkleRoot(address market, bytes32 root) external onlyRole(CURATOR_ROLE) {
        if (market == address(0)) revert ZeroAddress();
        merkleRoot[market] = root;
        emit MerkleRootSet(market, root);
    }

    /// @notice Prove membership in the current root and join the address set for `market`.
    function claim(address market, bytes32[] calldata proof) external {
        if (market == address(0)) revert ZeroAddress();
        bytes32 node = leaf(market, msg.sender);
        if (!MerkleProof.verifyCalldata(proof, merkleRoot[market], node)) revert InvalidProof();
        allowed[market][msg.sender] = true;
        emit EligibilityClaimed(market, msg.sender);
    }

    function leaf(address market, address user) public pure returns (bytes32) {
        return keccak256(bytes.concat(keccak256(abi.encode(market, user))));
    }
}
