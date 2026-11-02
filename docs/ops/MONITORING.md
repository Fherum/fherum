# Monitoring — FHERUM V1

Runnable: `script/ops/monitor.mjs` (Node ≥18, no deps, no keys, read-only `eth_call` via public RPC).
```
RPC_URL=https://robinhood-rpc.publicnode.com LENS=<LensReader> MARKETS=<market1,market2> \
USERS=<borrower1,...> WEBHOOK=<slack/discord url> node script/ops/monitor.mjs        # loop, 60s
... node script/ops/monitor.mjs --once                                               # single pass (cron)
```
Smoke-tested against a local anvil deployment by `script/ops/local-e2e.sh`.
V1 has no on-chain borrower enumeration: build USERS from `Borrow`/`SupplyCollateral` event logs (indexer or `cast logs`) and refresh hourly.

## Alerts

| Signal | Source | WARN | CRIT | Action |
|---|---|---|---|---|
| Position health factor | LensReader.userSnapshot | HF < 1.10 | HF < 1.03 / < 1 not liquidated within 10 min | check liquidator bots; if no liquidations happen, escalate |
| Utilization | snapshot.utilizationWad | ≥ 90 % | 100 % for > 1h | curator considers rate change; comms to lenders |
| Supply / borrow near cap | snapshot vs caps | ≥ 90 % | — | cap-raise review (runbook §10) |
| Oracle staleness | feed `latestRoundData.updatedAt` | age > 25h | age > OracleAdapter maxStaleness (reads revert) | INCIDENT SEV2 |
| Oracle bound | answer vs maxAnswer | answer ≥ 90 % of bound | feed disabled | Safe adjusts bound or pauses |
| Oracle deviation | compare answer to a CEX reference (not in script; add) | > 2 % | > 5 % | SEV1 if borrows live |
| Paused state | snapshot.paused / EmergencyController events | — | any pause | confirm intended; start comms |
| Privacy mode | snapshot.privacyMode | — | ≠ 0 (Public) | investigate |
| Large txs | logs of Market (Supply/Withdraw/Borrow/Liquidate) | > 10 % of TVL | > 25 % of TVL in one block | review; possible exploit pattern |
| Role changes | `RoleGranted/RoleRevoked` on all contracts; `CallScheduled` on Timelock | any scheduled op | any role change not in the change log | verify against planned ops; cancel via curator if unauthorised |
| Monitor health | the script itself | RPC error | no successful tick in 10 min | failover RPC (drpc) |

Not yet implemented in monitor.mjs (TODO): event-log based large-tx and role-change alerts, CEX price comparison, automatic USERS discovery. Use Tenderly/OpenZeppelin Defender-style alerts or extend the script.
