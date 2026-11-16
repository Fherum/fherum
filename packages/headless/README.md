# @fherum/headless

Headless Lending SDK for FHERUM on Robinhood Chain (4663). FHERUM is the lending engine, without the frontend: your app owns the UX, while FHERUM's markets handle rates, risk, oracles, liquidation and settlement.

- Read live markets and positions through LensReader. No API key needed.
- Build lending transactions as plain `{ to, data, value }`. The SDK never signs or sends anything; your user's wallet does.
- Dependency: `viem` only.

Status: v0.1. The source lives in this repo and is not on npm yet. Public mode means positions are visible on-chain. Contracts are not audited and caps are limited.

## Install (from this repo)

    npm i viem
    cp -r packages/headless/src ./fherum-headless

## Quickstart

    import { createHeadless, FHERUM, tx } from "./fherum-headless/index.ts";

    const fherum = createHeadless();               // public RPC by default; pass { rpcUrl } for your own
    const markets = await fherum.listMarkets();    // 16 USDG markets: WETH, stocks, ETFs
    console.log(markets[0].supplyApy, markets[0].availableLiquidity);

    const [, weth] = FHERUM.markets[0];
    const me = "0xYourUser";
    const approve = await fherum.approvalIfNeeded(FHERUM.tokens.USDG, me, weth, 1_000_000n);
    const supply = tx.supply(weth, 1_000_000n);   // 1 USDG (6 decimals)
    // walletClient.sendTransaction(approve) then walletClient.sendTransaction(supply)

Run it yourself:

    cd packages/headless && npm i && npm run example

## API

Reads (`createHeadless()`):

| Call | Returns |
|---|---|
| `listMarkets(addrs?)` | `Market[]`, with supply/borrow APY, utilization, liquidity, LTV, caps and pause flags |
| `getMarket(addr)` | `Market` |
| `getPosition(market, user)` | supplied, collateral, debt, health factor |
| `approvalIfNeeded(asset, owner, spender, amount)` | approve `TxRequest`, or `null` |

Tx builders (`tx.*`, pure, no network):

| Call | Contract |
|---|---|
| `supply`, `withdraw` | Market (loan asset, USDG) |
| `addCollateral`, `removeCollateral`, `borrow`, `repay` | Market |
| `approve` | ERC-20 |
| `hearth.createAccount(executor)` | HEARTH account factory: a per-owner vault for an agent |
| `hearth.applyStack(vault, stackId)` | HEARTH router: install a published hook stack in one tx |

Rates are fractions (`0.0425` = 4.25%). Amounts are raw token units (`bigint`).

## Addresses

`FHERUM` exports every mainnet address used by the SDK. Each one is browsable at `https://robinhoodchain.blockscout.com/address/<addr>`.

## Test

    npm test        # calldata equals `cast calldata` output
    npm run typecheck
