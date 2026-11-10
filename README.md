# FHERUM

Encrypted money markets on Robinhood Chain. Private borrower positions. Public market accountability.

Website: https://fherum.tech · X: [@Fherumfi](https://x.com/Fherumfi) · Token CA: [`0x8665f6e7ce1df1abe042d4b044e681be98a62974`](https://robinhoodchain.blockscout.com/token/0x8665f6e7ce1df1abe042d4b044e681be98a62974)

FHERUM is a curated lending protocol with an Aave V4-inspired hub-and-spoke architecture. Suppliers lend a borrow asset, borrowers post separate collateral, and an independent risk curator sets caps and risk parameters through a public 48-hour timelock.

> **Unaudited.** The contracts have not been audited. Markets run with conservative caps. Use at your own risk.

## Dual mode

FHERUM is built for two layers:

- **Private execution (FHE):** borrower positions — supply shares, collateral, debt, Health Factor — sit behind the `IFHEAdapter` interface (`encrypt`, `store`, `add`, `sub`, `mulByPlaintext`, compare, `decrypt`) with reserved storage words for ciphertext handles.
- **Public markets:** totals, utilization, rates, caps, curator actions and pauses are always public and readable through `LensReader`.

**Status today:** mainnet runs `PlaintextFHEAdapter`. It implements the same call shape with plain `uint256` values; `encryptionAvailable()` returns `false`. Positions, addresses and amounts are currently visible on-chain. The encrypted adapter is swapped in once an FHE coprocessor serves chain 4663. ERC-20 transfer amounts and wallet addresses stay public regardless, because the tokens themselves are public. See `docs/STORAGE-LAYOUT.md` and `docs/FIELD-MATRIX.md`.

## Modules

| Module | Role |
| --- | --- |
| VEILBOOK | Position book behind the FHE adapter interface |
| IRONCLAD | Fail-closed solvency: risk engine, oracle staleness, liquidation |
| FORGEHUB | Hub-and-spoke liquidity, market factory, curator registry |
| STEEL LENS | Public aggregate market data |
| IRON GATE | Optional allowlist / Merkle entry gate |
| BREAKGLASS | Guardian pause — repay is never blocked |

## Mainnet deployment (Robinhood Chain, chain id 4663)

| Contract | Address |
| --- | --- |
| Market · WETH/USDG | [`0xa4eE12E6f0C998B7Cc2F7Cc7724B2598Cb9370D7`](https://robinhoodchain.blockscout.com/address/0xa4eE12E6f0C998B7Cc2F7Cc7724B2598Cb9370D7) |
| LiquidityHub | [`0x7A7FfDFBB89C296106dA1A85B6fb13F27Ca357d8`](https://robinhoodchain.blockscout.com/address/0x7A7FfDFBB89C296106dA1A85B6fb13F27Ca357d8) |
| MarketFactory | [`0x16A295d143CeB63371078bFDf0681dBBeBff547a`](https://robinhoodchain.blockscout.com/address/0x16A295d143CeB63371078bFDf0681dBBeBff547a) |
| CuratorRegistry | [`0x2a359cc48c2ab2C8197c2eD68616f95A12e0ec75`](https://robinhoodchain.blockscout.com/address/0x2a359cc48c2ab2C8197c2eD68616f95A12e0ec75) |
| TimelockController (48h) | [`0x47cB8ee6CfDd18dA1450AC3a85a3179583Eb61A7`](https://robinhoodchain.blockscout.com/address/0x47cB8ee6CfDd18dA1450AC3a85a3179583Eb61A7) |
| FeeController | [`0xa6B8411a3DA887e3a7C1C3E2cB9A2A5e49275C84`](https://robinhoodchain.blockscout.com/address/0xa6B8411a3DA887e3a7C1C3E2cB9A2A5e49275C84) |
| RiskEngine | [`0x21cdc0b927b798B6c5064657a440C6b50675a8f8`](https://robinhoodchain.blockscout.com/address/0x21cdc0b927b798B6c5064657a440C6b50675a8f8) |
| LiquidationEngine | [`0xa468da610DEC6eE56d968838Bab993f69f8510aC`](https://robinhoodchain.blockscout.com/address/0xa468da610DEC6eE56d968838Bab993f69f8510aC) |
| InterestRateModel | [`0xBBfE0cf80F5d6651a95156B6fFE6Ab06213ef4E7`](https://robinhoodchain.blockscout.com/address/0xBBfE0cf80F5d6651a95156B6fFE6Ab06213ef4E7) |
| OracleAdapter | [`0x4572B9F17C9052fDAB5691f0dFbF0715dd60F9dE`](https://robinhoodchain.blockscout.com/address/0x4572B9F17C9052fDAB5691f0dFbF0715dd60F9dE) |
| PlaintextFHEAdapter | [`0x81683dC80582d3CC618CD0F0C266C538cB641FE1`](https://robinhoodchain.blockscout.com/address/0x81683dC80582d3CC618CD0F0C266C538cB641FE1) |
| LensReader | [`0xeC2f34031a2476bc0Df896356E7BD84f7240A14c`](https://robinhoodchain.blockscout.com/address/0xeC2f34031a2476bc0Df896356E7BD84f7240A14c) |
| EmergencyController | [`0xCfE0f3981e7CEb91c985bA33c60bA7f3E27e606b`](https://robinhoodchain.blockscout.com/address/0xCfE0f3981e7CEb91c985bA33c60bA7f3E27e606b) |
| ForgeAdmin | [`0x62e451eF11a01FE7b692c947dC63e197D2350e62`](https://robinhoodchain.blockscout.com/address/0x62e451eF11a01FE7b692c947dC63e197D2350e62) |
| Safe 2-of-3 (admin) | [`0x3E7CEd699783751FBc7eb1545144DCe6C64D38CB`](https://robinhoodchain.blockscout.com/address/0x3E7CEd699783751FBc7eb1545144DCe6C64D38CB) |
| Guardian | [`0x300DEE0673703ffA09318e8889BF727E4f2A88AE`](https://robinhoodchain.blockscout.com/address/0x300DEE0673703ffA09318e8889BF727E4f2A88AE) |
| Curator | [`0x785213e0Fc5fB1A7c19AF26b3ea533Df56A448b7`](https://robinhoodchain.blockscout.com/address/0x785213e0Fc5fB1A7c19AF26b3ea533Df56A448b7) |

Public RPC: `https://rpc.mainnet.chain.robinhood.com`. Testnet is chain id 46630 (`https://rpc.testnet.chain.robinhood.com`).

Verify any value directly with `cast` or Blockscout. `script/ops/curator-show.sh` prints the curator, Safe and timelock state read-only.

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

Hub buckets are per market. One market cannot draw another market's cash. Cross-spoke shared liquidity needs an interest-allocation design that is not in this release.

Collateral and borrow asset must differ. Collateral is escrowed 1:1 and does not earn the supply index. Suppliers of the borrow asset earn the supply index.

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

- Governor (`DEFAULT_ADMIN_ROLE` on hub, oracle, and emergency): allowlist, credit lines, spoke registration, oracle feeds, unpause. On markets created by `MarketFactory`, this role is the timelock, not the safe. The safe admins the timelock and the factory. On mainnet it is a Safe 2-of-3.
- Curator: queues risk parameters, caps, and rate parameters on factory markets. The timelock executes them after the delay, inside the same hard bounds (LTV at or below liquidation threshold, liquidation threshold at most 95%, bonus at most 15%, reserve factor at most 50%). A market constructed with an EOA curator can still change those parameters immediately. That path remains for tests. Production spokes should come from the factory.
- Guardian: pause only. Pause blocks borrow, collateral withdrawal, and liquidation. Repay, supply, and borrow-asset withdrawal stay available. The guardian cannot unpause, cancel a timelock, edit an allowlist, or move tokens.

`ForgeAdmin` requires a non-zero minimum delay. Queue, execute, and cancel are events on `CuratorRegistry`, alongside the timelock's `CallScheduled`, `CallExecuted`, and `Cancelled`. The indexer event list is in `docs/INDEXER-EVENTS.md`.

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

## Repository

- `src/` — Solidity contracts (MIT)
- `test/` — unit, fuzz and invariant tests
- `script/` — deploy and read-only ops scripts. No script holds a key; broadcasts use `cast --account` keystores.
- `web/` — Next.js app for fherum.tech. Copy `web/.env.example` to `web/.env.local`; never commit `.env*`.
- `docs/` — invariants, storage layout, events, ops runbooks

## Security

See [SECURITY.md](SECURITY.md).

## License

[MIT](LICENSE)
