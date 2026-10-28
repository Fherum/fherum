# FHERUM

Core lending contracts for a curated money market on Robinhood Chain. G2 is the plaintext skeleton. G4 adds a timelocked curator, an on-chain lens, an optional entry gate, and a fixed pause taxonomy.

Brief ID: ORC-20261028-01. Active branch: `feat/ORC-20261028-01`. Owner decision on 2026-10-28: stay on Robinhood Chain, ship public accounting now, and do not integrate a live FHE stack until a vendor supports this chain.

Positions are **public** today. Confidential (FHE) positions ship after vendor support on chain 4663/46630.

## What this is

Users supply a borrow asset, post a separate collateral asset, borrow, repay, withdraw, and liquidate under curator-set risk parameters. A hub custodies tokens per market and enforces a credit line. Interest uses a kinked utilization curve and a share/index reserve.

`privacyMode` is **Public** on every market. There is no setter. Collateral, debt, and Health Factor are public integers. `PlaintextFHEAdapter` implements the same call shape a future vendor adapter would (`encrypt`, `store`, `add`, `sub`, `mulByPlaintext`, compare, `decrypt`) by packing and unpacking `uint256` values. `encryptionAvailable()` is false. `isEncrypted` is false. `refuseCiphertextLabel` always reverts. These words are not ciphertext.

G1 (2026-10-28) was a NO-GO for confidential lending on Robinhood Chain: neither CoFHE nor FHEVM serves chain id 4663 or 46630. This repository does not vendor those SDKs and does not claim a live FHE deployment.

## Chain

| Network | Chain ID | RPC |
| --- | --- | --- |
| Robinhood mainnet | 4663 | `https://rpc.mainnet.chain.robinhood.com` |
| Robinhood testnet | 46630 | `https://rpc.testnet.chain.robinhood.com` |

Nothing here broadcasts a deployment. `script/DeployRobinhoodTestnet.s.sol` only prints the intended order. It reverts if `FHERUM_BROADCAST=true`.

## Layout

| Module | Role |
| --- | --- |
| `LiquidityHub` | Per-spoke custody, asset allowlist, credit line |
| `Market` | Supply, withdraw, collateral, borrow, repay, liquidate |
| `ReserveAccounting` | Supply/borrow shares and WAD/RAY indexes |
| `InterestRateModel` | Utilization kink, configurable per market |
| `OracleAdapter` | AggregatorV3 reads, staleness and validity |
| `RiskEngine` | LTV, liquidation threshold, Health Factor via the adapter |
| `PositionManager` | One position per user; reserved handle slots |
| `PlaintextFHEAdapter` | Public integer implementation of `IFHEAdapter` |
| `EmergencyController` | Guardian pause. Repay stays open. Supply and borrow-asset withdrawal stay open |
| `LiquidationEngine` | Bonus-capped seize. Does not socialize bad debt |
| `Caps` | Total and per-wallet supply and borrow caps |
| `ForgeAdmin` | Deploys the OpenZeppelin timelock and `CuratorRegistry`, then renounces admin |
| `CuratorRegistry` | Queues, executes, and cancels market parameter updates |
| `MarketFactory` | Creates a spoke whose governor and curator are the timelock, and registers it on the hub |
| `LensReader` | View helpers for totals, utilization, rates, caps, pause, and `privacyMode` |
| `AllowlistEligibility` | Optional address-set and Merkle gate for supply and borrow. Off unless set |

Hub buckets are per market in G2. One market cannot draw another market's cash. Cross-spoke shared liquidity needs an interest-allocation design that is not in this release.

Collateral and borrow asset must differ. Collateral is escrowed 1:1 and does not earn the supply index. Suppliers of the borrow asset earn the supply index.

## FHE-ready plan

Position storage keeps a 4-word region for supply shares, collateral, and debt. Word 0 is the public integer today. Words 1 to 3, plus a Health Factor word, stay zero. `layoutVersion` is 1. A future implementation can write vendor handles into those reserved words without shifting the struct. See `docs/STORAGE-LAYOUT.md`.

Until that implementation exists, and until a vendor actually serves 4663/46630, confidential mode is not selectable. Risk checks call `IFHEAdapter` and still operate on public values.

## Accounting sketch

- WAD = 1e18. Rates, LTV, liquidation threshold, bonus, and USD values.
- RAY = 1e27. Indexes start at RAY and never decrease.
- Utilization = debt assets / supply assets, capped at 100%. If supply is 0 and debt is not, utilization is 100%.
- Borrow rate below the kink: `base + slope1 * U / Uopt`. Above the kink: `base + slope1 + slope2 * (U - Uopt) / (1 - Uopt)`.
- Index update is linear over the elapsed 365-day year and compounds across accruals.
- Debt assets round up. Supply assets round down. Collateral values round down. Debt values round up.
- Health Factor = `collateralValue * liquidationThreshold / debtValue`. The gate is the product comparison `collateralValue * factor >= debtValue * WAD`. HF of 1 is healthy. Below 1 is liquidatable.
- Liquidation bonus is a WAD multiplier (`1.05e18` means 5%). Seize value is rounded down so it does not exceed repaid value times the bonus.
- Reserve factor mints supply shares to the fee recipient. Rounding dust stays as surplus cash.

Invariants, rounding, and known gaps are in `docs/INVARIANTS.md`. The public/target field split is in `docs/FIELD-MATRIX.md`.

## Roles

- Governor (`DEFAULT_ADMIN_ROLE` on hub, oracle, and emergency): allowlist, credit lines, spoke registration, oracle feeds, unpause. On markets created by `MarketFactory`, this role is the timelock, not the safe. The safe admins the timelock and the factory. It must be a Safe before any mainnet use. This repository does not deploy mainnet.
- Curator: queues risk parameters, caps, and rate parameters on factory markets. The timelock executes them after the delay, inside the same hard bounds (LTV at or below liquidation threshold, liquidation threshold at most 95%, bonus at most 15%, reserve factor at most 50%). A market constructed with an EOA curator can still change those parameters immediately. That path remains for tests. Production spokes should come from the factory.
- Guardian: pause only. Pause blocks borrow, collateral withdrawal, and liquidation. Repay, supply, and borrow-asset withdrawal stay available. The guardian cannot unpause, cancel a timelock, edit an allowlist, or move tokens.

`ForgeAdmin` requires a non-zero minimum delay. Queue, execute, and cancel are events on `CuratorRegistry`, alongside the timelock's `CallScheduled`, `CallExecuted`, and `Cancelled`. Details and the indexer event list are in `G4-REPORT.md` and `docs/INDEXER-EVENTS.md`.

## Develop

```bash
forge install
forge test
forge script script/DeployRobinhoodTestnet.s.sol
```

`forge test` runs unit, fuzz, and invariant tests. Fuzz is 256 runs. Invariants use 32 runs and depth 20.

Foundry 1.x and Solidity 0.8.28. OpenZeppelin Contracts 5.4. The build uses `via_ir` because liquidation sizing is wide.

Slither, when installed:

```bash
slither . --config-file slither.config.json
```

## Out of scope

No CoFHE or FHEVM SDK, no confidential user interface, no mainnet deploy, no private keys, no application frontend, no Aave V4 source, no protocol token. ERC-20 transfer amounts and wallet addresses stay public even after a future adapter, because the tokens themselves are public. Do not describe a deposit or a transfer as confidential.
