# Design decisions (V1, Robinhood mainnet 4663)

Short record of choices made deliberately. Each one lists the reason and where it is enforced.

## Liquidation

- **Close factor upper bound.** `closeFactorWad` must be in `[0.01e18, 1e18]` (`Market.sol` `MIN_CLOSE_WAD`, `setRiskParams` → `BadCloseFactor`). 100% is allowed so a curator can permit full closes on small, risky markets. The deploy default is lower (see the runbook).
- **Target-HF repay with fallback.** A liquidation repays the smallest amount that brings the Health Factor back to `targetHealthFactorWad` (> 1e18). The repay is capped by the close factor and by the collateral available to pay the bonus. If the target cannot be reached (`target <= LT * bonus`, so each repay lowers HF) the engine falls back to the close-factor cap (`LiquidationEngine.targetRepayValueWad` returns max). Dust positions can be closed in full.
- **Fixed bonus, no Dutch auction.** The bonus is a fixed multiplier in `[1e18, 1.15e18]`. A Dutch auction would need keeper timing assumptions and more audit surface. Not in V1.
- **Liquidation blocked while paused; repay stays open.** Pause blocks borrow, collateral withdrawal, and liquidation (`whenRiskAllowed`). Repay, supply, addCollateral, and supplied-liquidity withdrawal stay open, so borrowers can always de-risk. The trade-off: accrual continues during a long pause.

## Oracle

- **Deviation breaker, auto-reset.** `OracleAdapter.setMaxDeviation` (default off) rejects an answer that moves more than `bps` from the previous Chainlink round (`PriceDeviation`). The breaker clears itself on the next in-band round, or when the governor changes the bound. It never latches, so there is no stuck-oracle state to unlock by hand.
- **Chainlink phase boundary.** Proxy round ids are `phaseId << 64 | aggregatorRound`. On the first round of a new phase, `getRoundData(roundId - 1)` reverts or returns empty. The adapter then compares the answer with the cached `lastAccepted` reference, which is seeded by `setMaxDeviation` and refreshed by the permissionless `poke`. That reference is used only if its own `updatedAt` is within `maxStaleness`. Otherwise the call reverts `PreviousRoundUnavailable`, so pricing fails closed. Tests: `test/unit/OracleBreaker.t.sol`.
- **Deploy defaults.** `COLLATERAL_MAX_DEVIATION_BPS=1500` (WETH), `BORROW_MAX_DEVIATION_BPS=300` (stable). Set either one to 0 to disable it. Ops should run `poke` (or rely on user traffic) so the reference stays inside the staleness window around feed upgrades.
- **L2 sequencer uptime feed: N/A.** The Chainlink directory for Robinhood mainnet (`feeds-robinhood-mainnet.json`, 58 entries checked 2026-11-02) lists no sequencer-uptime feed. No sequencer check was added. Revisit if Chainlink publishes one.

## Mode and assets

- **Public mode V1, no FHE.** Client decision 2026-11-02; **written approval pending**. Positions are plaintext. `PlaintextFHEAdapter` refuses to label values as ciphertext. G1 was NO-GO for FHE on 4663.
- **Recommended pair: WETH collateral / USDG borrow.**
- **Blacklisted:** the fake "USDC" at `0x7eCca74AB958900EBBeD1b258cAb50Ae69409550`. Never list it on the hub or in a market.

## Governance and fees

- **FeeController per market.** The deploy script deploys a FeeController right after the market and passes its address, predicted from the deployer nonce, as `Market.feeRecipient`. This avoids any post-deploy admin call (the market admin is the timelock). Admin = timelock. Protocol recipient = `PROTOCOL_TREASURY` (default: Safe). Curator recipient = `CURATOR_FEE_RECIPIENT`. `CURATOR_FEE_SHARE_WAD` is capped at 50% (constructor `BadCuratorShare`). `VerifyDeployment` asserts all of these.
- **Timelock self-administered by default.** `TIMELOCK_ADMIN_TO_SAFE=false` is the default. Role changes on the timelock go through propose + delay. `true` is a temporary escape hatch only.
