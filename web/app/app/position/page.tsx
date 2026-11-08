import { PageHead } from "@/components/shell";
import { Panel, Tag } from "@/components/ui";
import { PortfolioTable, type PortfolioMarket } from "@/components/portfolio";
import Link from "next/link";
import { FIELDS } from "@/lib/protocol";
import { Suspense } from "react";
import { marketsFor, tryReadMarket } from "@/lib/chain";
import { getNet } from "@/lib/net-server";

const LEGEND = [
  ["ok", "Confirmed", "Read from chain at a known block."],
  ["warn", "Pending", "Transaction sent, not yet final."],
  ["mute", "Estimated", "Computed locally; interest keeps accruing."],
  ["bronze", "Encrypted · planned", "Not used yet. With FHE privacy mode, a field would be a ciphertext handle only you can decrypt."],
] as const;

export default function Position() {
  return (
    <>
      <PageHead eyebrow="Veilbook" title="Position">
        Public mode: every value here is readable on chain by anyone, like Aave or Compound. FHE privacy mode is planned, not live.
      </PageHead>
      <div className="grid xl:grid-cols-[1fr_380px] gap-4 items-start">
        <div className="grid gap-4">
          <Panel title="Collateral & debt">
            <Suspense fallback={<p className="px-6 py-10 text-mute text-xs">Reading chain…</p>}><Live /></Suspense>
          </Panel>
          <Panel title="Data provenance">
            <ul className="grid sm:grid-cols-2">
              {LEGEND.map(([t, k, d]) => (
                <li key={k} className="p-5 border-b sm:odd:border-r border-line grid gap-2">
                  <Tag tone={t}>{k}</Tag><p className="text-xs text-mute">{d}</p>
                </li>
              ))}
            </ul>
          </Panel>
          <Panel title="Who can see your fields">
            <ul>
              {FIELDS.filter((f) => f.today !== f.target).map((f) => (
                <li key={f.data} className="grid grid-cols-[1.5fr_1fr_1fr] px-5 py-3 border-b border-line last:border-0 text-sm">
                  <span>{f.data}</span><span className="font-mono text-xs text-warn">{f.today} now</span><span className="font-mono text-xs text-bronze">{f.target} later</span>
                </li>
              ))}
            </ul>
          </Panel>
        </div>
        <Panel title="Act on a market">
          <div className="p-5 grid gap-3 text-sm">
            <p className="text-ink-2">Supply, borrow, repay and withdraw from the market page. Each action reads your wallet balance and position live.</p>
            <Suspense fallback={<p className="text-mute text-xs">Loading markets…</p>}><MarketLinks /></Suspense>
          </div>
        </Panel>
      </div>
    </>
  );
}

async function MarketLinks() {
  const { net, live } = await getNet();
  const list = live ? marketsFor(net) : [];
  return list.length
    ? <>{list.map((m) => <Link key={m} href={`/app/markets/${m}`} className="font-mono text-xs text-bronze hover:underline break-all">Open market {m.slice(0, 6)}…{m.slice(-4)} →</Link>)}</>
    : <p className="text-mute text-xs">No market is deployed on this network yet.</p>;
}

async function Live() {
  const { net, live } = await getNet();
  return <PortfolioTable markets={await portfolioMarkets(net, live)} />;
}

async function portfolioMarkets(net: Parameters<typeof marketsFor>[0], live: boolean): Promise<PortfolioMarket[]> {
  if (!live) return [];
  const res = await Promise.all(marketsFor(net).map((a) => tryReadMarket(a, net)));
  return res.flatMap((r) => (r.ok ? [{ address: r.m.address, loan: { symbol: r.m.loan.symbol, decimals: r.m.loan.decimals }, collateral: { symbol: r.m.collateral.symbol, decimals: r.m.collateral.decimals } }] : []));
}
