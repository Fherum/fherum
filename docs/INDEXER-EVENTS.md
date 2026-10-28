# Indexer event surface

G4 does not ship an indexer. A later worker can rebuild public market state from the logs below. Position amounts are public integers. `privacyMode` is Public. Do not treat these logs as ciphertext.

Join `CuratorRegistry` ids to the timelock logs on the operation id. The registry event carries the market and the selector. `CallScheduled` carries the calldata.

## Market

| Event | Use |
| --- | --- |
| `Supplied(address,uint256,uint256)` | Supplier, assets, shares |
| `Withdrawn(address,uint256,uint256)` | Supplier, assets, shares burned |
| `CollateralAdded(address,uint256)` | Collateral deposit |
| `CollateralRemoved(address,uint256)` | Collateral withdrawal |
| `Borrowed(address,uint256,uint256)` | Borrower, assets, shares minted |
| `Repaid(address,address,uint256,uint256)` | Borrower, payer, assets, shares burned |
| `Liquidated(address,address,uint256,uint256)` | Borrower, liquidator, repay assets, seize assets |
| `Accrued(uint256,uint256,uint256,uint256)` | Supply index, borrow index, interest assets, fee shares |
| `RiskParamsUpdated(uint256,uint256,uint256,uint256,uint256,uint256)` | LTV, liquidation threshold, bonus, close factor, reserve factor, dust |
| `CapsUpdated(uint256,uint256,uint256,uint256)` | Supply, borrow, wallet supply, wallet borrow |
| `RateParamsUpdated(uint256,uint256,uint256,uint256)` | Base, slope1, slope2, optimal utilization |
| `FeeRecipientUpdated(address)` | Fee recipient |
| `EligibilityUpdated(address)` | Gate address. Zero means the gate is off |
| `PrivacyModeDeclared(uint8,string)` | Emitted once at construction. Mode 0, label `public` |

Totals, utilization, rates, caps, pause, and `privacyMode` are also readable from `LensReader` without an indexer.

## LiquidityHub

| Event | Use |
| --- | --- |
| `SpokeRegistered(address)` | Market enrolled |
| `AssetAllowed(address,bool)` | Asset allowlist |
| `CreditLimitSet(address,address,uint256)` | Spoke, asset, principal cap |
| `Deposited(address,address,uint8,uint256)` | Spoke, asset, bucket, amount |
| `Withdrawn(address,address,uint8,address,uint256)` | Spoke, asset, bucket, recipient, amount |
| `Drawn(address,address,address,uint256,uint256)` | Spoke, asset, borrower, amount, drawn after |
| `Restored(address,address,uint256,uint256)` | Spoke, asset, amount, drawn after |

Bucket `0` is liquidity. Bucket `1` is collateral.

## EmergencyController

| Event | Use |
| --- | --- |
| `MarketPaused(address,address)` | Risk pause turned on. Caller is guardian or governor |
| `MarketUnpaused(address,address)` | Governor cleared the pause |
| `RiskPauseSet(address,address,bool,bool,bool)` | Borrow, collateral withdrawal, liquidation flags |

Repay has no event and no flag. `repayPaused` is a pure false. Supply and borrow-asset withdrawal are not pausable.

## Curator and timelock

| Event | Use |
| --- | --- |
| `MarketRegistered(address)` | Factory enrolled the spoke |
| `MarketCreated(address,address,address)` | Market, collateral asset, borrow asset |
| `UpdateQueued(bytes32,address,bytes4,uint256)` | Operation id, market, selector, eta |
| `UpdateExecuted(bytes32,address)` | Operation id, market |
| `UpdateCancelled(bytes32,address)` | Operation id, caller |
| `CallScheduled(bytes32,uint256,address,uint256,bytes,bytes32,uint256)` | Timelock id, index, target, value, calldata, predecessor, delay |
| `CallExecuted(bytes32,uint256,address,uint256,bytes)` | Timelock execution |
| `CallSalt(bytes32,bytes32)` | Non-zero salt |
| `Cancelled(bytes32)` | Timelock cancellation |
| `MinDelayChange(uint256,uint256)` | Delay change. The timelock must call this itself |

## Eligibility

| Event | Use |
| --- | --- |
| `AllowedSet(address,address,bool)` | Market, user, allowed |
| `MerkleRootSet(address,bytes32)` | Market, root |
| `EligibilityClaimed(address,address)` | Market, user who proved the root |

Leaf preimage is `keccak256(bytes.concat(keccak256(abi.encode(market, user))))`. Proof pairs are sorted.
