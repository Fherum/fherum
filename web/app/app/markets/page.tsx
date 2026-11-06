import { Suspense } from "react";
import Link from "next/link";
import { PageHead } from "@/components/shell";
import { Empty, Panel, Th } from "@/components/ui";
import { RateCurve } from "@/components/rate-curve";
import { ActionPanel, type Action } from "@/components/action-panel";
import { EarnBorrowTabs } from "@/components/earn-borrow-tabs";
import { HARD_BOUNDS } from "@/lib/protocol";
import { getNet } from "@/lib/net-server";
import { marketsFor, amt, pct, tryReadMarket } from "@/lib/chain";
import type { Net } from "@/lib/net";
import { readHistory } from "@/lib/history";
import { TokenLogo, PairLogo } from "@/components/token-logo";
import { Sparkline } from "@/components/market-chart";

const DEMO_ROUTE = "/app/markets/0x0000000000000000000000000000000000000000";
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const EARN_COLS = ["Supply asset", "Supply APY", "Total supplied", "Utilization", "Available", "Supply cap", "Trend", "Market"];
const BORROW_COLS = ["Collateral → Borrow", "Borrow APY", "Total borrowed", "Available to borrow", "Max LTV", "Liq. threshold", "Borrow cap", "Trend", "Privacy"];
type View = "earn" | "borrow";
const colsOf = (v: View) => (v === "earn" ? EARN_COLS : BORROW_COLS);

export default async function Markets() {
  const { live, chain: TARGET_CHAIN, net } = await getNet();
  const MARKETS = marketsFor(net);
  const has = live && MARKETS.length > 0;
  const table = (v: View) => (
    <Panel title={v === "earn" ? "Earn · supply markets" : "Borrow · collateral markets"}
      aside={<span className="font-mono text-[11px] text-mute">{has ? MARKETS.length : 0} markets · {TARGET_CHAIN.name}</span>}>
      <div className="overflow-x-auto">
        <table className="mkt-table w-full min-w-[720px] text-sm">
          <thead className="border-b border-line">
            <tr>{colsOf(v).map((c, i) => <Th key={c} right={i > 0 && i < colsOf(v).length - 1}>{c}</Th>)}</tr>
          </thead>
          <tbody>
            {has
              ? MARKETS.map((a) => <Suspense key={a} fallback={<Placeholder r={0} v={v} />}><Row address={a} net={net} v={v} /></Suspense>)
              : [0, 1, 2].map((r) => <Placeholder key={r} r={r} v={v} />)}
          </tbody>
        </table>
      </div>
      <p className="px-5 py-3 text-xs text-mute border-t border-line leading-relaxed">
        {v === "earn"
          ? "Supplied assets are lent to borrowers in this market. You earn the variable supply rate and can withdraw whatever liquidity is not borrowed."
          : "Add collateral first, then borrow up to the max LTV. If your Health Factor drops below 1.00, the position can be liquidated."}
        {net === "mainnet" ? " Public mode: positions are visible on-chain. Not audited, caps limited." : " Testnet: mock tokens, simulated encryption."}
      </p>
      {!has && (
        <div className="border-t border-line">
          <Empty title={live ? "No markets created yet." : "No markets deployed on this network."}>
            Markets are created through MarketFactory and listed here from LensReader. The rows above are layout placeholders, not data.
            <Link href={DEMO_ROUTE} className="mt-4 inline-block font-mono text-xs uppercase text-bronze hover:underline">Preview market page layout (empty) →</Link>
          </Empty>
        </div>
      )}
    </Panel>
  );
  return (
    <>
      <PageHead eyebrow="Forgehub" title="Markets"
        aside={<div className="flex gap-2">
          <input type="search" placeholder="Search asset" disabled={!live} aria-label="Search markets"
            className="h-9 w-56 bg-s1 border border-line px-3 text-sm placeholder:text-mute disabled:opacity-50" />
        </div>}>
        Each market pairs one collateral asset with one loan asset under curator-set limits. Earn by supplying the loan asset, or borrow it against collateral. Rates are variable and shown as estimates.
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

function Placeholder({ r, v }: { r: number; v: View }) {
  const C = colsOf(v);
  return (
    <tr className="border-b border-line last:border-0" aria-hidden>
      {C.map((c, i) => (
        <td key={c} className="px-4 h-14">
          <div className={`h-2 bg-s3 ${i === 0 ? "w-36" : "w-12"} ${i > 0 && i < C.length - 1 ? "ml-auto" : ""}`} style={{ opacity: 0.9 - r * 0.3 }} />
        </td>
      ))}
    </tr>
  );
}

const cap = (v: bigint, d: number, sym: string) => (v === BigInt(0) ? "No cap" : `${amt(v, d, 0)} ${sym}`);

async function Row({ address, net, v }: { address: `0x${string}`; net: Net; v: View }) {
  const r = await tryReadMarket(address, net);
  const href = `/app/markets/${address}`;
  const C = colsOf(v);
  if (!r.ok) {
    return (
      <tr className="border-b border-line last:border-0">
        <td colSpan={C.length} className="px-4 h-14 font-mono text-xs text-bad">
          <Link href={href} className="hover:underline">{short(address)}</Link> · read failed
        </td>
      </tr>
    );
  }
  const { m } = r;
  const s = m.snap;
  const L = m.loan;
  const num = "px-4 h-14 text-right num font-mono";
  const hist = await readHistory(address, net, L.decimals, 12);
  const trend = <td className="px-4 h-14 text-right">{hist ? <Sparkline values={hist.points.map((p) => (v === "earn" ? p.supply : p.debt))} /> : <span className="font-mono text-[10px] text-mute">—</span>}</td>;
  if (v === "earn") {
    return (
      <tr className="border-b border-line last:border-0 hover:bg-s2">
        <td className="px-4 h-14"><Link href={href} className="flex items-center gap-3 font-stencil text-lg uppercase hover:text-bronze"><TokenLogo symbol={L.symbol} />{L.symbol}</Link></td>
        <td className={`${num} text-bronze`}>{pct(s.supplyRatePerYearWad)}</td>
        <td className={num}>{amt(s.totalSupplyAssets, L.decimals, 0)} {L.symbol}</td>
        <td className={num}>{pct(s.utilizationWad)}</td>
        <td className={num}>{amt(s.availableLiquidity, L.decimals, 0)} {L.symbol}</td>
        <td className={num}>{cap(s.supplyCap, L.decimals, L.symbol)}</td>
        {trend}
        <td className="px-4 h-14 font-mono text-xs uppercase text-mute">vs {m.collateral.symbol}{s.paused ? " · paused" : ""}</td>
      </tr>
    );
  }
  return (
    <tr className="border-b border-line last:border-0 hover:bg-s2">
      <td className="px-4 h-14"><Link href={href} className="flex items-center gap-3 font-stencil text-lg uppercase hover:text-bronze"><PairLogo col={m.collateral.symbol} loan={L.symbol} />{m.collateral.symbol} → {L.symbol}</Link></td>
      <td className={`${num} text-bronze`}>{pct(s.borrowRatePerYearWad)}</td>
      <td className={num}>{amt(s.totalDebtAssets, L.decimals, 0)} {L.symbol}</td>
      <td className={num}>{amt(s.availableLiquidity, L.decimals, 0)} {L.symbol}</td>
      <td className={num}>{pct(s.ltvWad)}</td>
      <td className={num}>{pct(s.liquidationThresholdWad)}</td>
      <td className={num}>{cap(s.borrowCap, L.decimals, L.symbol)}</td>
      {trend}
      <td className="px-4 h-14 font-mono text-xs uppercase">{s.privacyMode === 0 ? (net === "mainnet" ? "Public · FHE coming" : "Simulated") : `Mode ${s.privacyMode}`}{s.borrowPaused || s.paused ? " · paused" : ""}</td>
    </tr>
  );
}
