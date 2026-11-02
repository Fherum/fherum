# Incident Response — FHERUM V1 (Robinhood Chain 4663)

## Who can do what (from src/, verified by script/VerifyDeployment.s.sol)

| Actor | Holds | Can | Cannot |
|---|---|---|---|
| GUARDIAN (EOA or 2-of-N Safe) | EmergencyController.GUARDIAN_ROLE | `pause(market)` — instant | unpause, change params, move funds |
| GOVERNOR_SAFE | DEFAULT_ADMIN on EmergencyController, OracleAdapter, LiquidityHub, MarketFactory, CuratorRegistry (+ TimelockController admin while TIMELOCK_ADMIN_TO_SAFE) | `pause`, `unpause`; `OracleAdapter.setFeed/disableFeed/setMaxDeviation/setMarketStatus` (instant); hub asset allow-list and credit limits (instant); grant/revoke roles | change Market params directly (Market admin is the timelock) |
| CURATOR | CuratorRegistry.CURATOR_ROLE | queue caps / risk / rate / eligibility / fee recipient / target HF via timelock (≥48h) | anything instant |
| TimelockController | Market DEFAULT_ADMIN + CURATOR_ROLE | executes queued ops after delay (executor = anyone) | — |
| Anyone | — | supply, withdraw, repay, liquidate (unless paused), execute ready timelock ops | — |

## Pause matrix (EmergencyController.pause is all-or-nothing)

| Action | When paused |
|---|---|
| Supply | open (not pausable) |
| Withdraw (lenders) | open (not pausable; limited by liquidity) |
| Borrow | **paused** |
| Remove collateral | **paused** |
| Liquidation | **paused** |
| Repay | always open (no flag exists) |

Consequence: pausing also stops liquidations → bad debt can accumulate if prices keep moving. Pause only as long as needed; plan the unpause.

## Severity / playbooks

**SEV1 — funds at risk (exploit, wrong oracle price, feed manipulated/frozen with live borrows)**
1. Guardian: `cast send <EMERGENCY> "pause(address)" <MARKET>` (pre-filled tx saved in the Safe / hardware wallet). Target < 15 min from alert.
2. If oracle is the cause: Safe `OracleAdapter.disableFeed(asset)` or `setFeed` to a corrected bound/feed (instant).
3. Safe: `LiquidityHub.setCreditLimit(market, asset, 0)` to cap further hub draws if relevant.
4. War room: guardian, 2 Safe signers, lead dev, comms. Snapshot state with LensReader; preserve tx hashes.
5. Fix → audit-reviewed patch → unpause by Safe. Post-mortem within 72h.

**SEV2 — degraded (feed stale > maxStaleness, utilization 100 %, RPC/explorer outage, sequencer halt)**
- Stale feed: reads revert → borrows/liquidations fail naturally; decide whether to pause to avoid inconsistent UX. Do not loosen staleness without 2 Safe signers agreeing.
- 100 % utilization: lenders cannot withdraw; curator may queue rate slope increase (48h). Communicate.
- Sequencer halt: pause when it resumes if prices moved >10 % during the halt, to give borrowers time to repay (repay stays open).

**SEV3 — non-critical** (frontend bug, monitor false positive): normal fix, no on-chain action.

## Unpause checklist
Root cause understood · fix deployed/verified or risk accepted in writing · oracle prices sane vs CEX · HF distribution reviewed (positions under 1 will be liquidated immediately on unpause — announce ≥1h earlier so borrowers can repay) · 2 Safe signers + lead dev sign-off.

## Comms templates

Initial (≤30 min):
> We have paused borrowing, collateral withdrawal and liquidations on the FHERUM <MARKET> market on Robinhood Chain while we investigate <short neutral description>. Supplying, withdrawing available liquidity and repaying remain available. Funds: <"no loss identified so far" / "under assessment">. Next update by <time UTC>.

Update:
> Status <time UTC>: <what we know>, <what we did>, <next step>. Next update by <time>.

Resolution:
> The <MARKET> market will be unpaused at <time UTC>. Positions with health factor < 1 may be liquidated immediately after; please check your position. A post-mortem will be published by <date>.

Never claim encryption/privacy (V1 is public mode). Never speculate on attacker identity. Do not post tx details that would help a copycat before the fix.

## Contacts (fill in before launch)
Guardian on-call rota: … · Safe signers (5): … · Lead dev: … · Comms: … · Auditor emergency contact: … · Chainlink support: https://chain.link/ (support form) · Robinhood Chain ops: …
