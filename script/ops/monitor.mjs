#!/usr/bin/env node
// FHERUM read-only monitor. No keys, no deps (Node >= 18, global fetch). Public RPC only.
// Env:
//   RPC_URL   default https://robinhood-rpc.publicnode.com  (Robinhood Chain mainnet 4663)
//   LENS      LensReader address (required)
//   MARKETS   comma-separated Market addresses (required)
//   USERS     optional comma-separated borrowers to watch for HF (V1 has no on-chain enumeration;
//             feed this list from your indexer of Borrow events)
//   INTERVAL  seconds between polls (default 60); pass --once for a single pass
//   WEBHOOK   optional URL; alerts are POSTed as JSON {text}
// Thresholds: HF_WARN (1.10), HF_CRIT (1.03), UTIL_WARN (0.90), STALE_WARN_S (90000 = 25h),
//             CAP_WARN (0.90 of supply/borrow cap).
// CTOR-SYNC: decoding assumes LensReader.MarketSnapshot / UserSnapshot field order in src/LensReader.sol.

const RPC = process.env.RPC_URL || "https://robinhood-rpc.publicnode.com";
const LENS = process.env.LENS;
const MARKETS = (process.env.MARKETS || "").split(",").map((s) => s.trim()).filter(Boolean);
const USERS = (process.env.USERS || "").split(",").map((s) => s.trim()).filter(Boolean);
const ONCE = process.argv.includes("--once");
const INTERVAL = Number(process.env.INTERVAL || 60);
const WAD = 10n ** 18n;
const T = {
  hfWarn: Number(process.env.HF_WARN || 1.1),
  hfCrit: Number(process.env.HF_CRIT || 1.03),
  util: Number(process.env.UTIL_WARN || 0.9),
  stale: Number(process.env.STALE_WARN_S || 90000),
  cap: Number(process.env.CAP_WARN || 0.9),
};

// Precomputed 4-byte selectors (verified with `cast sig`).
const SEL = {
  snapshot: "0x26512160", // snapshot(address)
  userSnapshot: "0xb52a3e56", // userSnapshot(address,address)
  collateralAsset: "0xaabaecd6", // collateralAsset()
  borrowAsset: "0x446456e5", // borrowAsset()
  oracle: "0x7dc0d1d0", // oracle()
  feeds: "0x2fba4aa9", // feeds(address)
  latestRoundData: "0xfeaf968c", // latestRoundData()
};
Object.assign(SEL, JSON.parse(process.env.FHERUM_SELECTORS || "{}"));

let id = 0;
async function rpc(method, params) {
  const r = await fetch(RPC, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: ++id, method, params }),
  });
  const j = await r.json();
  if (j.error) throw new Error(`${method}: ${j.error.message}`);
  return j.result;
}
const pad = (a) => a.toLowerCase().replace(/^0x/, "").padStart(64, "0");
const call = (to, data) => rpc("eth_call", [{ to, data }, "latest"]);
const words = (hex) => hex.replace(/^0x/, "").match(/.{64}/g).map((w) => BigInt("0x" + w));
const addr = (w) => "0x" + w.toString(16).padStart(40, "0");
const f = (x, d = 18) => Number(x) / 10 ** d;

async function alert(level, text) {
  const line = `${new Date().toISOString()} [${level}] ${text}`;
  console.log(line);
  if (process.env.WEBHOOK && level !== "INFO") {
    try {
      await fetch(process.env.WEBHOOK, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: line }) });
    } catch (e) { console.error("webhook failed", e.message); }
  }
}

const SNAP = ["totalSupplyAssets", "totalDebtAssets", "totalSupplyShares", "totalBorrowShares", "totalCollateral",
  "availableLiquidity", "utilizationWad", "borrowRatePerYearWad", "supplyRatePerYearWad", "supplyCap", "borrowCap",
  "walletSupplyCap", "walletBorrowCap", "ltvWad", "liquidationThresholdWad", "liquidationBonusWad", "closeFactorWad",
  "reserveFactorWad", "dustValueWad", "supplyIndex", "borrowIndex", "paused", "borrowPaused", "removeCollateralPaused",
  "liquidationPaused", "repayPaused", "privacyMode", "eligibility"];
const USNAP = ["supplyShares", "supplyAssets", "collateralAssets", "debtShares", "debtAssets", "healthFactorWad", "eligible"];
const decode = (hex, names) => Object.fromEntries(words(hex).slice(0, names.length).map((w, i) => [names[i], w]));

async function checkFeed(oracle, asset, label, now) {
  // OracleAdapter.feeds(asset) -> (aggregator, tokenDecimals, expectedPriceDecimals, maxStaleness, maxAnswer, enabled)
  const fw = words(await call(oracle, SEL.feeds + pad(asset)));
  const agg = addr(fw[0]);
  const maxStale = Number(fw[3]);
  if (fw[5] === 0n) return alert("CRIT", `${label} feed DISABLED for ${asset}`);
  const r = words(await call(agg, SEL.latestRoundData));
  const age = now - Number(r[3]);
  const lvl = age > maxStale ? "CRIT" : age > T.stale ? "WARN" : "INFO";
  await alert(lvl, `${label} feed ${agg} answer=${r[1]} age=${age}s maxStaleness=${maxStale}s maxAnswer=${fw[4]}`);
  if (r[1] * 10n >= fw[4] * 9n) await alert("WARN", `${label} answer within 10% of maxAnswer bound`);
}

async function tick() {
  const block = await rpc("eth_getBlockByNumber", ["latest", false]);
  const now = Number(BigInt(block.timestamp));
  await alert("INFO", `block ${BigInt(block.number)} ts ${now} rpc ${RPC}`);
  for (const m of MARKETS) {
    const s = decode(await call(LENS, SEL.snapshot + pad(m)), SNAP);
    const util = f(s.utilizationWad);
    await alert("INFO", `market ${m} supply=${s.totalSupplyAssets} debt=${s.totalDebtAssets} util=${util.toFixed(4)} ` +
      `liq=${s.availableLiquidity} caps=${s.supplyCap}/${s.borrowCap} privacyMode=${s.privacyMode}`);
    if (s.paused) await alert("CRIT", `market ${m} PAUSED (borrow=${s.borrowPaused} removeCol=${s.removeCollateralPaused} liq=${s.liquidationPaused})`);
    if (util >= T.util) await alert("WARN", `market ${m} utilization ${util.toFixed(4)} >= ${T.util}`);
    if (s.supplyCap > 0n && Number(s.totalSupplyAssets) >= T.cap * Number(s.supplyCap)) await alert("WARN", `market ${m} supply near cap`);
    if (s.borrowCap > 0n && Number(s.totalDebtAssets) >= T.cap * Number(s.borrowCap)) await alert("WARN", `market ${m} borrow near cap`);
    if (s.privacyMode !== 0n) await alert("CRIT", `market ${m} privacyMode != Public`);
    const oracle = addr(words(await call(m, SEL.oracle))[0]);
    await checkFeed(oracle, addr(words(await call(m, SEL.collateralAsset))[0]), "collateral", now);
    await checkFeed(oracle, addr(words(await call(m, SEL.borrowAsset))[0]), "borrow", now);
    for (const u of USERS) {
      const us = decode(await call(LENS, SEL.userSnapshot + pad(m) + pad(u)), USNAP);
      if (us.debtAssets === 0n) continue;
      const hf = us.healthFactorWad >= 2n ** 255n ? Infinity : f(us.healthFactorWad);
      const lvl = hf < 1 ? "CRIT" : hf < T.hfCrit ? "CRIT" : hf < T.hfWarn ? "WARN" : "INFO";
      await alert(lvl, `market ${m} user ${u} HF=${hf.toFixed(4)} debt=${us.debtAssets} col=${us.collateralAssets}`);
    }
  }
}

async function main() {
  if (!LENS || MARKETS.length === 0) {
    console.error("set LENS and MARKETS (see header)");
    process.exit(2);
  }
  for (;;) {
    try { await tick(); } catch (e) { await alert("CRIT", `monitor error: ${e.message}`); if (ONCE) process.exit(1); }
    if (ONCE) return;
    await new Promise((r) => setTimeout(r, INTERVAL * 1000));
  }
}
main();
