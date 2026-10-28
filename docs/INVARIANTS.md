# Invariants and math (G2)

Scales: WAD = 1e18, RAY = 1e27, year = 365 days.

## Share and index

Supply assets = `floor(shares * supplyIndex / RAY)`.

Debt assets = `ceil(shares * borrowIndex / RAY)`.

New supply shares = `floor(assets * RAY / supplyIndex)`.

New borrow shares are `ceil(assets * RAY / borrowIndex)`, plus one share if that would still record less than the cash sent to the borrower. The borrower receives the requested cash and owes at least that much.

Repay of the full debt burns every share and pulls the current owed amount. A partial repay targets `owed - requested`, rounds the remaining shares up, and pulls only the debt that actually disappears. If the request is too small to burn a share, the call reverts rather than forgiving debt.

Indexes start at RAY. Accrual uses the borrow rate from utilization at the start of the elapsed interval:

`borrowIndex' = borrowIndex * (RAY + rateWad * dt / year * 1e9) / RAY`

with the rate in annual WAD. The supply index increases by the supplier portion of realized debt growth:

`interest = debt(newIndex) - debt(oldIndex)`

`fee = floor(interest * reserveFactor / WAD)`

`supplyIndex' = supplyIndex + floor((interest - fee) * RAY / totalSupplyShares)`

Fee shares `floor(fee * RAY / supplyIndex')` are added to `totalSupplyShares` during accrual and credited to the fee recipient before the transaction returns. `pendingFeeShares` is zero outside an in-flight call. Both indexes are checked non-decreasing. A zero borrower balance or a zero rate only moves `lastAccrual`.

Utilization `U = debt / supply` when supply is non-zero, else 0 if debt is also 0, else 100%. The kink model:

- `U <= Uopt`: `base + slope1 * U / Uopt`
- `U > Uopt`: `base + slope1 + slope2 * (U - Uopt) / (1 - Uopt)`

`Uopt` is kept inside `[1%, 99%]` so neither divisor is zero. Supplier APR shown by `previewRates` is the estimate `borrowRate * U * (1 - reserveFactor)`. Realized supplier value is the supply index, not that estimate.

## Solvency

For the borrow asset, after each action:

`hub liquidity cash + ceil(totalBorrowShares * borrowIndex / RAY) >= floor(totalSupplyShares * supplyIndex / RAY)`

Interest increases debt by the full borrower accrual and increases supplier claims by at most that amount. Withdrawals burn enough shares that accounted supply falls by at least the cash paid out. Borrow sends cash only when the recorded debt grows by at least that cash. Rounding leftovers stay in the hub and are not assigned to a supplier. Direct ERC-20 transfers that skip `deposit` are not credited.

Collateral is a different asset, escrowed 1:1:

`sum of user collateral == market.totalCollateral == hub collateral cash`

## Risk

Collateral value rounds down. Debt value rounds up. Both go through `OracleAdapter`, which reverts on a disabled feed, a non-positive answer, a future timestamp, a stale timestamp, a mismatched decimal count, an incomplete round, or an answer above the configured max. A bad price is not replaced with zero.

Borrow requires `collateralValue * LTV >= debtValue * WAD` and a Health Factor of at least 1. Collateral withdrawal requires a Health Factor of at least 1 and does not re-apply LTV, so a position may sit between LTV and the liquidation threshold. Health Factor 1 is not liquidatable.

`HF = floor(collateralValue * liquidationThreshold / debtValue)` when debt value is non-zero. The gate used by the contracts is the product comparison through `IFHEAdapter.productGte`, which matches that floor for an integer threshold of 1 WAD.

## Caps and credit

Supply and borrow caps, including per-wallet caps, are checked on the action in asset units. Later interest can push accounted totals slightly past a cap. New supply or borrow still fails the check.

`principalDrawn` increases by cash borrowed and decreases by repayments, capped at the previous drawn amount so interest payments do not underflow it. `principalDrawn <= creditLimit` is enforced on every draw. A spoke cannot withdraw another spoke's bucket.

## Pause and liquidation

Pause blocks borrow, collateral withdrawal, and liquidation. It does not block repay, supply, accrual, or withdrawal of supplied borrow-asset liquidity. The guardian cannot call the hub.

Liquidation requires Health Factor below 1, a fresh oracle, and a liquidator other than the borrower. Repay size is capped by the close factor unless debt value is under the dust value, and by the collateral that can cover the bonus. Seize value uses floor rounding and must satisfy `seizeValue * WAD <= repayValue * bonusWad`. Bonus is a multiplier: `1.05e18` is 5% extra collateral value, and the hard max is `1.15e18`.

## What is tested

Foundry unit tests cover the formulas, oracle failures, pause, caps, credit isolation, the 1.6 Health Factor example, a one-year accrual vector, and bonus-exact liquidation. Fuzz tests cover a non-decreasing rate, non-decreasing indexes, 512-bit products, value round-trips, liquidation quotes, and borrow/withdraw Health Factor. Invariant tests replay supply, withdraw, collateral, borrow, repay, liquidation, time, and pause.

## Known gaps (not G2)

- No timelock. A compromised curator can move parameters inside the hard bounds immediately.
- No bad-debt socialization. A position can be left with debt after collateral is exhausted.
- Accrual continues while paused. A long pause with liquidation blocked can deepen insolvency. Repay stays open.
- Stale oracles block liquidation as well as new risk. That avoids seizing on a dead price and can delay liquidation.
- Collateral deposits are not under the borrow-asset supply cap.
- One collateral asset and one borrow asset per market. No multi-asset portfolio.
- Cross-spoke fungible liquidity is not enabled.
- Contracts are not upgradeable. The position layout is reserved so a later version can migrate without reshuffling slots, but that migration is not implemented.
- Confidential mode is not implemented. G1 was NO-GO for FHE on 4663/46630.
