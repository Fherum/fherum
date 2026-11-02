# Reference model (brief 6.13)

`model.py` is a Python 3 stdlib model of the brief section 6 math. It was written from the brief formulas, not
translated from the Solidity. Regenerate the vectors with:

    python3 test/reference/model.py

This writes `vectors.json` (for review) and `ReferenceVectors.sol` (the same data as Solidity). The Foundry
test reads the `.sol` copy instead of calling `vm.readFile`. The reason: `foundry.toml` `fs_permissions` only
allows `./src`, and this workstream may not change config outside `src/` and `test/`. If `./test/reference` is
granted read access later, the test can switch to `vm.parseJson`.

`ReferenceVectors.t.sol` checks that contract output equals model output exactly, with zero tolerance. Every
rounding direction is mirrored in the model:
- value: floor for collateral, ceil for debt
- HF: floor
- rate: floor
- accrual: factor floor, borrow index floor, debt ceil, supply index floor, fee shares floor
- liquidation: target repay ceil, close cap floor, cover floor, repay value floor, seize floor

Rounding favours the protocol.

## Category coverage (6.13)

| Category | Vectors / tests |
|---|---|
| exact boundary at HF threshold | hf `exact_threshold` |
| HF just above/below | hf `just_above`, `just_below` |
| zero debt / zero collateral | hf `zero_debt`, `zero_collateral`; values `zero_amount` |
| maximum permitted amount | hf `max_permitted` (1e36 values) |
| minimum token amount | values `min_token_6dec`, hf `dust_values` |
| different decimals | values `usdc_like`/`wbtc_like`/`eth_18`/`price_18dec`; liquidation `diff_decimals` |
| extreme valid prices | values `extreme_low_price`, `extreme_high_price` |
| invalid/stale oracle | not a pure-math vector; covered by `test/unit/OracleAdapter.t.sol` and `test/unit/OracleBreaker.t.sol` |
| utilization 0/kink/±kink/100% | rates `u0`, `below_kink`, `kink`, `above_kink`, `u100`, `util_*` |
| accrual short/long | accrual `one_second`, `one_hour`, `one_year`, `ten_years`, `zero_dt` |
| rounding on borrow/repay/withdraw/liquidation | value up/down pairs; accrual share conversions; liquidation `rounding_odd_amounts`. Market-level rounding is checked by `test/fuzz/AccountingFuzz.t.sol` and the invariant suite |
| partial/full/dust liquidation | liquidation `partial_target`, `partial_requested`, `full_close_dust_residual`, `dust_residual_reverts`, `below_dust_full`, `infeasible_target_closefactor`, `bad_debt_cover_cap`, `high_target`, `max_bonus` |
| repeated calls and ordering | `test/unit/LiquidationAdversarial.t.sol` (front-run, sequential liquidations), invariant suite |
| fuzzed values at numeric bounds | `test/fuzz/AccountingFuzz.t.sol`, `testFuzz_quoteRestoresTargetOrHitsCap` |

## Not applicable

- **Multiple collateral assets with different factors:** V1 markets are isolated, with one collateral and one debt asset.
- **Encrypted/public parity:** mainnet V1 runs in PUBLIC mode. `PlaintextFHEAdapter` holds plaintext and claims no ciphertext, so there is no encrypted path to compare against.
- **FHE job delayed, repeated or unavailable:** there are no FHE jobs in PUBLIC mode.
