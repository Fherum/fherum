// Read live FHERUM markets and build (not send) a supply tx.
import { createHeadless, FHERUM, tx } from "../src/index.ts";

const fherum = createHeadless();
const markets = await fherum.listMarkets();
for (const m of markets) {
  const avail = Number(m.availableLiquidity) / 10 ** m.loan.decimals;
  console.log(`${m.collateral.symbol}/${m.loan.symbol}`.padEnd(12), `supply ${(m.supplyApy * 100).toFixed(2)}%`, `util ${(m.utilization * 100).toFixed(1)}%`, `avail ${avail.toFixed(2)} ${m.loan.symbol}`);
}

// 1 USDG (6 decimals) into WETH/USDG — hand this to the user's wallet to sign.
const [, weth] = FHERUM.markets[0];
console.log("supply tx", tx.supply(weth, 1_000_000n));
