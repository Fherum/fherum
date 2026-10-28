import { Suspense } from "react";
import Link from "next/link";
import { PageHead } from "@/components/shell";
import { Empty, Panel, Th } from "@/components/ui";
import { RateCurve } from "@/components/rate-curve";
import { ActionPanel } from "@/components/action-panel";
import { HARD_BOUNDS, TARGET_CHAIN, isDeployed } from "@/lib/protocol";
import { MARKETS, amt, pct, tryReadMarket } from "@/lib/chain";

const DEMO_ROUTE = "/app/markets/0x0000000000000000000000000000000000000000";
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const COLS = ["Collateral → Loan", "Supply APY", "Borrow APY", "Utilization", "Liquidity", "LLTV", "Oracle", "Curator", "Privacy"];

export default function Markets() {
  const live = isDeployed();
  return (
    <>
      <PageHead eyebrow="Forgehub" title="Markets"
        aside={<div className="flex gap-2">
          <input type="search" placeholder="Search asset" disabled={!live} aria-label="Search markets"
            className="h-9 w-56 bg-s1 border border-line px-3 text-sm placeholder:text-mute disabled:opacity-50" />
        </div>}>
        Each market pairs one collateral asset with one loan asset under curator-set limits. Rates are variable and shown as estimates.
      </PageHead>

      <div className="grid 2xl:grid-cols-[1fr_380px] gap-4 items-start">
        <div className="grid gap-4 min-w-0">
          <Panel title="All markets" aside={<span className="font-mono text-[11px] text-mute">{live ? MARKETS.length : 0} markets · {TARGET_CHAIN.name}</span>}>
            <div className="overflow-x-auto">
              <table className="mkt-table w-full min-w-[720px] text-sm">
                <thead className="border-b border-line">
                  <tr>{COLS.map((c, i) => <Th key={c} right={i > 0 && i < 6}>{c}</Th>)}</tr>
                </thead>
                <tbody>
                  {live && MARKETS.length > 0
                    ? MARKETS.map((a) => <Suspense key={a} fallback={<Placeholder r={0} />}><Row address={a} /></Suspense>)
                    : [0, 1, 2].map((r) => <Placeholder key={r} r={r} />)}
                </tbody>
              </table>
            </div>
            {!(live && MARKETS.length > 0) && (
              <div className="border-t border-line">
                <Empty title={live ? "No markets created yet." : "No markets deployed on this network."}>
                  Markets are created through MarketFactory and listed here from LensReader. The rows above are layout placeholders, not data.
                  <Link href={DEMO_ROUTE} className="mt-4 inline-block font-mono text-xs uppercase text-bronze hover:underline">Preview market page layout (empty) →</Link>
                </Empty>
              </div>
            )}
          </Panel>

          <div className="grid lg:grid-cols-2 gap-4">
            <Panel title="Rate model · illustration">
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
        <div className="2xl:sticky 2xl:top-20"><ActionPanel /></div>
      </div>
    </>
  );
}

function Placeholder({ r }: { r: number }) {
  return (
    <tr className="border-b border-line last:border-0" aria-hidden>
      {COLS.map((c, i) => (
        <td key={c} className="px-4 h-14">
          <div className={`h-2 bg-s3 ${i === 0 ? "w-36" : "w-12"} ${i > 0 && i < 6 ? "ml-auto" : ""}`} style={{ opacity: 0.9 - r * 0.3 }} />
        </td>
      ))}
    </tr>
  );
}

async function Row({ address }: { address: `0x${string}` }) {
  const r = await tryReadMarket(address);
  const href = `/app/markets/${address}`;
  if (!r.ok) {
    return (
      <tr className="border-b border-line last:border-0">
        <td colSpan={COLS.length} className="px-4 h-14 font-mono text-xs text-bad">
          <Link href={href} className="hover:underline">{short(address)}</Link> · read failed
        </td>
      </tr>
    );
  }
  const { m } = r;
  const s = m.snap;
  const cells = [
    `${pct(s.supplyRatePerYearWad)}`,
    `${pct(s.borrowRatePerYearWad)}`,
    pct(s.utilizationWad),
    `${amt(s.availableLiquidity, m.loan.decimals, 0)} ${m.loan.symbol}`,
    pct(s.liquidationThresholdWad),
  ];
  return (
    <tr className="border-b border-line last:border-0 hover:bg-s2">
      <td className="px-4 h-14"><Link href={href} className="font-stencil text-lg uppercase hover:text-bronze">{m.collateral.symbol} → {m.loan.symbol}</Link></td>
      {cells.map((c, i) => <td key={i} className="px-4 h-14 text-right num font-mono">{c}</td>)}
      <td className="px-4 h-14 font-mono text-xs">{short(m.oracle)}</td>
      <td className="px-4 h-14 font-mono text-xs">{short(m.curator)}</td>
      <td className="px-4 h-14 font-mono text-xs uppercase">{s.privacyMode === 0 ? "Public" : `Mode ${s.privacyMode}`}{s.paused ? " · paused" : ""}</td>
    </tr>
  );
}
