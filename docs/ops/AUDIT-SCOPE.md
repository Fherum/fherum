# Audit Scope — FHERUM V1 (request for quote)

Product: isolated lending markets (one collateral / one borrow asset per market) with a shared LiquidityHub, curator-managed parameters behind an OpenZeppelin TimelockController, Chainlink oracles, guardian pause. Deployment: Robinhood Chain mainnet (4663, Arbitrum Orbit L2). V1 runs in PUBLIC mode with `PlaintextFHEAdapter` (no FHE/encryption in production).
Toolchain: Foundry, Solidity 0.8.28, OpenZeppelin Contracts. Commit: <fill in frozen commit hash>.

## In scope (nSLOC to be re-measured on the frozen commit; numbers below are raw `wc -l`, 2026-11-02, while target-HF liquidation / FeeController / oracle breaker work was still in progress)

| File | Lines |
|---|---|
| src/Market.sol | 777 |
| src/PositionManager.sol | 230 |
| src/CuratorRegistry.sol | 200 |
| src/LiquidationEngine.sol | 186 |
| src/OracleAdapter.sol | 178 |
| src/MarketFactory.sol | 151 |
| src/FeeController.sol | 146 (new) |
| src/LiquidityHub.sol | 136 |
| src/EmergencyController.sol | 105 |
| src/LensReader.sol | 95 (view only) |
| src/PlaintextFHEAdapter.sol | 93 |
| src/InterestRateModel.sol | 64 |
| src/AllowlistEligibility.sol | 60 |
| src/RiskEngine.sol | 59 |
| src/ForgeAdmin.sol | 40 |
| src/ChainIds.sol | 10 |
| src/libraries/ (Caps, FixedPoint, Math512, ReserveAccounting, ValueMath) | 205 |
| src/interfaces/, src/types/ | 97 |
| script/DeployMainnet.s.sol (deployment + role hand-over correctness) | ~335 |
| **Total src** | **2832** |

Out of scope: test/, web/ frontend, script/DeployTestnetMocks*, mocks, OpenZeppelin and Chainlink code (assumed correct), FHE (non-plaintext) adapters.

## Areas we want focus on / known risks
1. Accounting: share/asset rounding, interest accrual, reserve accounting, LiquidityHub credit limits vs per-market cash; first-depositor / donation inflation.
2. Liquidation: new target-health-factor logic, close factor, bonus, dust handling, bad-debt socialisation; liquidations while partially paused.
3. Oracle: staleness, maxAnswer bound, new deviation breaker using `roundId-1` (Chainlink phase boundaries), equity feeds that do not update on weekends (us_equities_24/5) and IMarketStatus gating, L2 sequencer downtime (no sequencer-uptime feed check today — confirm whether one exists on 4663).
4. Governance: timelock bypasses; CuratorRegistry operation encoding/salt; Safe as timelock admin; role hand-over in DeployMainnet; FeeController curator share cap.
5. Pause design: pause is all-or-nothing and also stops liquidations; repay never pausable; supply/withdraw not pausable.
6. Tokens: assumed standard ERC20 (WETH, USDG). Fee-on-transfer, rebasing, blocklist/pausable tokens (tokenized stocks) are not supported — confirm safe failure modes.
7. PositionManager: approvals, multicall/permit patterns, reentrancy.
8. PlaintextFHEAdapter: ensure no code path implies confidentiality; `privacyMode` must remain Public.

## Deliverables requested
Report with severity, fix review round, statement on the deployment script. Timeline target: <weeks>. Contact: <email>.
