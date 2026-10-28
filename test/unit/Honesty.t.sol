// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";

/// @notice Guards copy in source and the README. Plaintext must not be described as live FHE.
contract HonestyTest is Test {
    function test_sourcesDoNotClaimLiveConfidentiality() public view {
        string[12] memory files = [
            "src/PlaintextFHEAdapter.sol",
            "src/interfaces/IFHEAdapter.sol",
            "src/Market.sol",
            "src/PositionManager.sol",
            "src/RiskEngine.sol",
            "src/LiquidityHub.sol",
            "src/OracleAdapter.sol",
            "src/LiquidationEngine.sol",
            "src/InterestRateModel.sol",
            "src/EmergencyController.sol",
            "src/types/PrivacyMode.sol",
            "README.md"
        ];
        for (uint256 i = 0; i < files.length; i++) {
            string memory src = vm.readFile(files[i]);
            assertFalse(_contains(src, "MEV-proof"), files[i]);
            assertFalse(_contains(src, "fully private"), files[i]);
            assertFalse(_contains(src, "confidential deposit"), files[i]);
            assertFalse(_contains(src, "the first FHE"), files[i]);
        }
        string memory adapter = vm.readFile("src/PlaintextFHEAdapter.sol");
        assertTrue(_contains(adapter, "not ciphertext"));
        string memory readme = vm.readFile("README.md");
        assertTrue(_contains(readme, "4663"));
        assertTrue(_contains(readme, "46630"));
        assertTrue(_contains(readme, "Public"));
    }

    function _contains(string memory haystack, string memory needle) internal pure returns (bool) {
        bytes memory h = bytes(haystack);
        bytes memory n = bytes(needle);
        if (n.length == 0 || n.length > h.length) return false;
        for (uint256 i = 0; i <= h.length - n.length; i++) {
            bool match_ = true;
            for (uint256 j = 0; j < n.length; j++) {
                if (h[i + j] != n[j]) {
                    match_ = false;
                    break;
                }
            }
            if (match_) return true;
        }
        return false;
    }
}
