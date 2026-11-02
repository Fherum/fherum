# FHERUM V1 Mainnet Runbook (Robinhood Chain 4663)

V1 is PUBLIC mode: PlaintextFHEAdapter, no encryption. Do not make privacy/encryption claims anywhere.
Nothing in this repo broadcasts by default. `--broadcast` is only run by the deployer during step 6, after sign-off.

## 0. Gates (all must be YES)
- [ ] External audit report final, all High/Medium fixed and re-reviewed (see AUDIT-SCOPE.md).
- [ ] `forge test` green on the exact commit; commit hash recorded; `git status` clean.
- [ ] src/ constructors match `script/DeployMainnet.s.sol` (search `CTOR-SYNC`). In particular decide on FeeController (see §9).
- [ ] `script/ops/local-e2e.sh` prints `ALL CHECKS PASSED` and `E2E DONE`.
- [ ] Monitoring (MONITORING.md) and incident roster (INCIDENT-RESPONSE.md) ready.

## 1. Safe setup
1. Create GOVERNOR_SAFE on 4663 (Safe 1.4.1 L2 singleton + ProxyFactory are deployed, see ORACLES.md). Recommended 3-of-5, hardware wallets, signers in ≥2 orgs/locations. No signer key on a hot server.
2. Optionally create a GUARDIAN Safe 2-of-4 (fast pause), or use a dedicated hardware EOA. Guardian can only pause; it cannot unpause.
3. Test both: sign and execute a 0-value tx on 4663. Record addresses + signer list in the ops vault.
4. CURATOR: the address allowed to queue param changes via CuratorRegistry (still timelocked). Use a Safe too.

## 2. Pick assets and feeds
From ORACLES.md only VERIFIED-ONCHAIN entries. V1 default: collateral WETH 0x0Bd7…AD73 / ETH-USD feed 0x78F3…d3A9; borrow USDG 0x5fc5…d168 / USDG-USD feed 0x61B7…9aD2. Re-read `description()`, `decimals()`, `latestRoundData()` on the day.

## 3. Env file (kept by deployer, never committed)
```
CONFIRM_MAINNET=yes
GOVERNOR_SAFE=  GUARDIAN=  CURATOR=  FEE_RECIPIENT=   # FEE_RECIPIENT defaults to Safe
TIMELOCK_DELAY=172800            # >= 48h enforced on 4663
COLLATERAL_ASSET= COLLATERAL_FEED= COLLATERAL_DECIMALS=18 COLLATERAL_MAX_ANSWER=1000000000000   # $10k sanity bound, 8 dec
BORROW_ASSET=     BORROW_FEED=     BORROW_DECIMALS=6      BORROW_MAX_ANSWER=110000000           # $1.10 bound
COLLATERAL_MAX_STALENESS=90000 BORROW_MAX_STALENESS=90000   # heartbeat 24h + 1h
# optional overrides (defaults are the conservative launch values):
# SUPPLY_CAP=100000e6 BORROW_CAP=50000e6 WALLET_SUPPLY_CAP=10000e6 WALLET_BORROW_CAP=5000e6
# LTV_WAD=0.6e18 LT_WAD=0.7e18 LIQ_BONUS_WAD=1.08e18 CLOSE_FACTOR_WAD=0.5e18 LAUNCH_CAP_CEILING=1000000e6
```
Script refuses: wrong chain, missing CONFIRM_MAINNET, delay < 48h, Safe without code, any asset/feed without code, caps above ceiling, unreadable feeds.

## 4. Dry run on a fork (no broadcast)
```
anvil --fork-url https://robinhood.drpc.org --chain-id 31337 --port 8546   # publicnode has no historical state
ALLOW_ANVIL=yes <env> forge script script/DeployMainnet.s.sol --fork-url http://127.0.0.1:8546 --sender <DEPLOYER>
```
Expect `Script ran successfully` and the address list. Then run it once more directly against mainnet RPC *without* `--broadcast`:
`forge script script/DeployMainnet.s.sol --rpc-url https://rpc.mainnet.chain.robinhood.com --sender <DEPLOYER>` → `SIMULATION COMPLETE`.

## 5. Deployer wallet
Fresh hardware-backed EOA (`--ledger`), funded with just enough ETH for gas. It ends with zero roles (asserted on-chain by the script).

## 6. Broadcast (after 2-person review of env + simulation output)
`forge script script/DeployMainnet.s.sol --rpc-url https://rpc.mainnet.chain.robinhood.com --ledger --sender <DEPLOYER> --broadcast --slow`
Archive `broadcast/DeployMainnet.s.sol/4663/run-latest.json` and the console log.

## 7. Verify
1. Source: `forge verify-contract <addr> <Contract> --chain 4663 --verifier blockscout --verifier-url https://robinhoodchain.blockscout.com/api/` (or `--verify` on step 6). Confirm "verified" on the explorer for every contract.
2. Roles/params: `FACTORY= MARKET= LENS= DEPLOYER= GOVERNOR_SAFE= GUARDIAN= CURATOR= forge script script/VerifyDeployment.s.sol --rpc-url https://robinhood-rpc.publicnode.com` → `ALL CHECKS PASSED`.
3. Publish addresses (docs + frontend config) only after 1–2 pass.

## 8. Go-live
- Start monitor (`script/ops/monitor.mjs`) with alerts to the on-call channel.
- Seed: team supplies a small amount, borrows and repays, one liquidation drill on a forked copy.
- Announce with caps stated publicly.

## 9. Known decisions before launch
- FeeController (src/FeeController.sol, new, being built concurrently) is NOT deployed by the script yet. Market's fee recipient is set at construction; if curator fee split is required at launch, FeeController needs to be the recipient — update `DeployMainnet` (CTOR-SYNC) once the design is final.
- TIMELOCK_ADMIN_TO_SAFE=false (default): the timelock is self-administered; role changes on it go through propose+delay. Setting `true` leaves the Safe as timelock admin (instant role changes) and should only be used temporarily, then renounced.
- Oracle deviation breaker: default off (0). Chainlink proxy reads of `roundId-1` can fail at aggregator phase changes; test before enabling.

## 10. Raising caps
Caps change only through CuratorRegistry → Timelock (≥48h):
1. Curator Safe calls `CuratorRegistry.queueCaps(market, supply, borrow, walletSupply, walletBorrow)` (check exact function name in src/CuratorRegistry.sol). Also `LiquidityHub.setCreditLimit` via Safe if borrow cap grows.
2. Announce publicly with the eta.
3. After delay anyone executes. Run VerifyDeployment / monitor to confirm.
Rule of thumb: raise by ≤2× per step, only if utilization < 80 %, no incident in the last 14 days, and on-chain liquidity for the collateral supports liquidating the full borrow cap at bonus with < 5 % slippage.
