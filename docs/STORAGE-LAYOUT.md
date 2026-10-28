# Position storage layout (G2)

`PositionManager` keeps one position per user. The mapping is storage slot 0 of `PositionManager`. Immutables (`fhe`, `market`) do not occupy slots. Do not insert a state variable above the mapping.

`forge inspect PositionManager storageLayout` confirms the mapping slot. The struct offsets below match `solc` storage layout for `PositionManager.Position` (compiler 0.8.28).

Relative slots inside a position, base = `keccak256(abi.encode(user, 0))`:

| Slot | Offset | Field | G2 contents |
| --- | --- | --- | --- |
| 0 | 0 | `owner` (address) | User address. Always public. |
| 0 | 20 | `status` (uint8) | 1 once the position has been touched |
| 0 | 21 | `privacyMode` (uint8) | 0 = `PrivacyMode.Public` |
| 0 | 22 | `openedAt` (uint40) | Timestamp |
| 0 | 27 | `updatedAt` (uint40) | Timestamp |
| 1 | 0 | `supplySharesWord` | `bytes32(uint256)` supply shares |
| 2 | 0 | `supplyReserved1` | Zero |
| 3 | 0 | `supplyReserved2` | Zero |
| 4 | 0 | `supplyReserved3` | Zero |
| 5 | 0 | `collateralWord` | `bytes32(uint256)` collateral token amount (1:1, no index) |
| 6-8 | 0 | `collateralReserved1..3` | Zero |
| 9 | 0 | `debtSharesWord` | `bytes32(uint256)` borrow shares |
| 10-12 | 0 | `debtReserved1..3` | Zero |
| 13 | 0 | `healthFactorHandle` | Zero. Health Factor is computed, not stored |
| 14 | 0 | `layoutVersion` | 0 empty, 1 = G2 plaintext words |

Slot 0 is packed from the low bytes upward: `owner` is the least significant 20 bytes. A storage test checks that decode.

## Why the extra words exist

Vendor ciphertext handles are not the same type as a Solidity `uint256`. Zama-style and CoFHE-style handles are typically a `bytes32`, sometimes with extra ACL words. Each amount therefore owns four words:

- word 0 is the live value
- words 1-3 are reserved and must stay zero while `layoutVersion == 1`

G2 never writes the reserved words. `PositionManager` reverts if any of them, or `healthFactorHandle`, is non-zero. It also reverts if `layoutVersion` is anything other than 0 or 1, and if a touched position is not `PrivacyMode.Public`.

## Migration rule for a later confidential implementation

G2 contracts are not upgradeable. Do not put this storage behind a proxy until a migration plan is reviewed. The layout is still fixed so a future implementation can migrate in place:

1. Read word 0 as a public integer. Do not reinterpret that integer as a handle.
2. Ask the vendor adapter for a real handle. Write it into words 0-3 according to that vendor's width.
3. Set `layoutVersion` to 2 on that position only.
4. Set the position `privacyMode` to Confidential only after `encryptionAvailable()` is true on a vendor adapter that actually runs on chain 4663/46630, and only under an explicit governance action.
5. Readers branch on `layoutVersion`. Version 1 code must not run against version 2 rows. This G2 bytecode reverts on any other version instead of guessing.

Market-level `privacyMode()` is a constant `Public`. There is no function that returns or stores Confidential. Adding a setter in this bytecode would be a bug.

`PlaintextFHEAdapter` does not steal a high bit as a "ciphertext flag". The full `uint256` range in word 0 is a public integer. Tagging word 0 in place would make large balances ambiguous, so handles belong in the reserved words plus a version bump, not in a flag bit.

Reserve totals, indexes, caps, and oracle config stay public. They are not position fields. The field matrix is `docs/FIELD-MATRIX.md`.
