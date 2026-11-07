import { Suspense, type ReactNode } from "react";
import Link from "next/link";
import { PageHead } from "@/components/shell";
import { Empty, Panel } from "@/components/ui";
import { RateCurve } from "@/components/rate-curve";
import { ActionPanel, type Action } from "@/components/action-panel";
import { EarnBorrowTabs } from "@/components/earn-borrow-tabs";
import { HARD_BOUNDS } from "@/lib/protocol";
import { getNet } from "@/lib/net-server";
import { marketsFor, amt, pct, tryReadMarket } from "@/lib/chain";
import type { Net } from "@/lib/net";
import { readHistory } from "@/lib/history";
import { TokenLogo } from "@/components/token-logo";
import { Sparkline } from "@/components/market-chart";

const DEMO_ROUTE = "/app/markets/0x0000000000000000000000000000000000000000";
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
type View = "earn" | "borrow";
const NAMES: Record<string, string> = { USDG: "Global Dollar", WETH: "Wrapped Ether", TSLA: "Tesla", NVDA: "NVIDIA", AAPL: "Apple", TUSD: "Test Dollar", TETH: "Test Ether" };
const nameOf = (sym: string) => NAMES[sym.toUpperCase()] ?? sym;

export default async function Markets() {
  const { live, chain: TARGET_CHAIN, net } = await getNet();
  const MARKETS = marketsFor(net);
  const has = live && MARKETS.length > 0;
  const reads = has ? await Promise.all(MARKETS.map((a) => tryReadMarket(a, net))) : [];
  const table = (v: View) => (
    <Panel title={v === "earn" ? "Earn · supply markets" : "Borrow · collateral markets"}
      aside={<span className="font-mono text-[11px] text-mute">{has ? MARKETS.length : 0} markets · {TARGET_CHAIN.name}</span>}>
      {has
        ? <MarketGroups reads={reads} addrs={MARKETS} net={net} v={v} />
        : <Empty title={live ? "No markets created yet." : "No markets deployed on this network."}>
            Markets are created through MarketFactory and listed here from LensReader.
            <Link href={DEMO_ROUTE} className="mt-4 inline-block font-mono text-xs uppercase text-bronze hover:underline">Preview market page layout (empty) →</Link>
          </Empty>}
      <p className="px-5 py-3 text-xs text-mute border-t border-line leading-relaxed">
        {v === "earn"
          ? "Supplied assets are lent to borrowers in this market. You earn the variable supply rate and can withdraw whatever liquidity is not borrowed."
          : "Add collateral first, then borrow up to the max LTV. If your Health Factor drops below 1.00, the position can be liquidated."}
        {net === "mainnet" ? " Public mode: positions are visible on-chain. Not audited, caps limited." : " Testnet: mock tokens, simulated encryption."}
      </p>
    </Panel>
  );
  const totals = new Map<string, number>();
  for (const r of reads) if (r.ok) totals.set(r.m.loan.symbol, (totals.get(r.m.loan.symbol) ?? 0) + Number(r.m.snap.totalSupplyAssets) / 10 ** r.m.loan.decimals);
  const deposits = [...totals].map(([k, n]) => `${n.toLocaleString("en-US", { maximumFractionDigits: 0 })} ${k}`).join(" · ") || "—";
  return (
    <>
      <PageHead eyebrow="Forgehub · Aave V4-inspired hub-and-spoke" title="Markets"
        aside={<div className="flex items-end gap-6">
          <div className="text-right"><div className="font-mono text-[11px] uppercase text-mute">Protocol deposits</div><div className="num font-mono text-2xl text-ink">{deposits}</div></div>
          <input type="search" placeholder="Search asset" disabled={!live} aria-label="Search markets"
            className="h-9 w-56 bg-s1 border border-line px-3 text-sm placeholder:text-mute disabled:opacity-50" />
        </div>}>
        One shared liquidity hub, isolated market spokes, live on Robinhood Chain. Each market pairs one collateral asset with one loan asset under curator-set limits, with FHE-ready private positions. Earn by supplying the loan asset, or borrow it against collateral. Rates are variable and shown as estimates.
      </PageHead>

      <div className="grid gap-4">
        <EarnBorrowTabs
          earn={table("earn")}
          borrow={table("borrow")}
          earnPanel={<Suspense fallback={<ActionPanel only={["Supply", "Withdraw"]} />}><DefaultPanel live={live} net={net} only={["Supply", "Withdraw"]} /></Suspense>}
          borrowPanel={<Suspense fallback={<ActionPanel only={["Collateral", "Remove", "Borrow", "Repay"]} />}><DefaultPanel live={live} net={net} only={["Collateral", "Remove", "Borrow", "Repay"]} /></Suspense>}
        />

        <div className="grid lg:grid-cols-2 gap-4">
          <Panel title="Rate model · supply and borrow curves">
            <div className="p-5"><RateCurve /></div>
          </Panel>
          <Panel title="Hard bounds · enforced in contract">
            <ul>
              {HARD_BOUNDS.map((b) => (
                <li key={b.param} className="flex justify-between gap-4 px-5 py-3.5 border-b border-line last:border-0 text-sm">
                  <span className="text-ink-2">{b.param}</span><span className="num font-mono text-ink">{b.rule}</span>
                </li>
              ))}
            </ul>
            <p className="px-5 py-4 text-xs text-mute border-t border-line leading-relaxed">A curator can set parameters only inside these bounds, and every change waits out the timelock.</p>
          </Panel>
        </div>
      </div>
    </>
  );
}

/** Binds the side panel to the first live market so the list page is actionable, not a dead form. */
async function DefaultPanel({ live, net, only }: { live: boolean; net: Net; only: Action[] }) {
  const MARKETS = marketsFor(net);
  if (!live || MARKETS.length === 0) return <ActionPanel only={only} />;
  const r = await tryReadMarket(MARKETS[0], net);
  if (!r.ok) return <ActionPanel only={only} />;
  const { m } = r;
  return (
    <div className="grid gap-2">
      <p className="font-mono text-[11px] uppercase text-mute">
        Acting on <Link href={`/app/markets/${m.address}`} className="text-ink hover:text-bronze">{m.collateral.symbol} → {m.loan.symbol}</Link>
        {MARKETS.length > 1 ? " · open another market to switch" : ""}
      </p>
      <ActionPanel market={{
        address: m.address,
        loan: { address: m.loan.address, symbol: m.loan.symbol, decimals: m.loan.decimals },
        collateral: { address: m.collateral.address, symbol: m.collateral.symbol, decimals: m.collateral.decimals },
        paused: m.snap.paused, borrowPaused: m.snap.borrowPaused, removeCollateralPaused: m.snap.removeCollateralPaused, repayPaused: m.snap.repayPaused,
      }} only={only} />
    </div>
  );
}

type Read = Awaited<ReturnType<typeof tryReadMarket>>;

/** Aave-style grid: one section per asset (loan asset on Earn, collateral on Borrow), one card per market. */
function MarketGroups({ reads, addrs, net, v }: { reads: Read[]; addrs: readonly `0x${string}`[]; net: Net; v: View }) {
  const groups = new Map<string, { name: string; items: { a: `0x${string}`; r: Read }[] }>();
  reads.forEach((r, i) => {
    const key = r.ok ? (v === "earn" ? r.m.loan.symbol : r.m.collateral.symbol) : "?";
    const name = r.ok ? nameOf(key) : "Unreadable";
    const g = groups.get(key) ?? { name, items: [] as { a: `0x${string}`; r: Read }[] };
    g.items.push({ a: addrs[i], r });
    groups.set(key, g);
  });
  return (
    <div className="divide-y divide-line">
      {[...groups].map(([sym, g]) => (
        <section key={sym} className="p-5">
          <h3 className="flex items-center gap-3 mb-4">
            <TokenLogo symbol={sym} size={30} />
            <span className="font-stencil text-2xl uppercase">{g.name}</span>
            <span className="font-mono text-sm text-mute">{sym}</span>
            <span className="ml-auto font-mono text-[11px] text-mute">{g.items.length} market{g.items.length > 1 ? "s" : ""}</span>
          </h3>
          <div className="grid sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-3">
            {g.items.map(({ a, r }) => <Suspense key={a} fallback={<div className="h-48 border border-line bg-s1" />}><Card address={a} r={r} net={net} v={v} /></Suspense>)}
          </div>
        </section>
      ))}
    </div>
  );
}

const cap = (v: bigint, d: number, sym: string) => (v === BigInt(0) ? "No cap" : `${amt(v, d, 0)} ${sym}`);

async function Card({ address, r, net, v }: { address: `0x${string}`; r: Read; net: Net; v: View }) {
  const href = `/app/markets/${address}`;
  if (!r.ok) return <Link href={href} className="block border border-line bg-s1 p-4 font-mono text-xs text-bad hover:underline">{short(address)} · read failed</Link>;
  const { m } = r;
  const s = m.snap;
  const L = m.loan;
  const hist = await readHistory(address, net, L.decimals, 12);
  const series = hist?.points.map((p) => (v === "earn" ? p.supply : p.debt)) ?? [];
  const other = v === "earn" ? m.collateral.symbol : L.symbol;
  const paused = s.paused || (v === "borrow" && s.borrowPaused);
  const line = (k: string, val: ReactNode) => (
    <div className="flex items-center justify-between gap-3 text-xs"><span className="text-mute">{k}</span><span className="num font-mono text-ink">{val}</span></div>
  );
  return (
    <Link href={href} className="group grid gap-4 border border-line bg-s1 p-4 hover:border-bronze hover:bg-s2 transition-colors">
      <div className="flex items-center gap-2 font-mono text-[11px] uppercase text-ink-2">
        <TokenLogo symbol={other} size={16} />{v === "earn" ? `vs ${other}` : `borrow ${other}`}
        <span className={`ml-auto ${paused ? "text-warn" : "text-mute"}`}>{paused ? "paused" : s.privacyMode === 0 ? (net === "mainnet" ? "public" : "simulated") : `mode ${s.privacyMode}`}</span>
      </div>
      <div className="flex items-end justify-between gap-3">
        <div>
          <div className="text-[11px] text-mute">{v === "earn" ? "Earn APY" : "Borrow APY"}</div>
          <div className="num font-mono text-2xl text-bronze">{pct(v === "earn" ? s.supplyRatePerYearWad : s.borrowRatePerYearWad)}</div>
        </div>
        {series.some((x) => x > 0) ? <Sparkline values={series} w={110} h={36} /> : <span className="font-mono text-[10px] uppercase text-mute">no activity yet</span>}
      </div>
      <div className="grid gap-1.5 border-t border-line pt-3">
        {v === "earn" ? <>
          {line("Total deposits", `${amt(s.totalSupplyAssets, L.decimals, 0)} ${L.symbol}`)}
          {line("Available", `${amt(s.availableLiquidity, L.decimals, 0)} ${L.symbol}`)}
          {line("Supply cap", cap(s.supplyCap, L.decimals, L.symbol))}
          {line("Collateral exposure", <span className="inline-flex items-center gap-1.5"><TokenLogo symbol={m.collateral.symbol} size={16} />{m.collateral.symbol}</span>)}
        </> : <>
          {line("Total borrowed", `${amt(s.totalDebtAssets, L.decimals, 0)} ${L.symbol}`)}
          {line("Available to borrow", `${amt(s.availableLiquidity, L.decimals, 0)} ${L.symbol}`)}
          {line("Max LTV / Liq.", `${pct(s.ltvWad)} / ${pct(s.liquidationThresholdWad)}`)}
          {line("Borrow cap", cap(s.borrowCap, L.decimals, L.symbol))}
        </>}
      </div>
    </Link>
  );
}
