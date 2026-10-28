import { PageHead } from "@/components/shell";
import { Empty, Panel, Th } from "@/components/ui";
import { RateCurve } from "@/components/rate-curve";
import { ActionPanel } from "@/components/action-panel";
import { HARD_BOUNDS, TARGET_CHAIN, isDeployed } from "@/lib/protocol";

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
          <Panel title="All markets" aside={<span className="font-mono text-[11px] text-mute">0 markets · {TARGET_CHAIN.name}</span>}>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[920px] text-sm">
                <thead className="border-b border-line">
                  <tr>{COLS.map((c, i) => <Th key={c} right={i > 0 && i < 6}>{c}</Th>)}</tr>
                </thead>
                <tbody>
                  {[0, 1, 2].map((r) => (
                    <tr key={r} className="border-b border-line last:border-0" aria-hidden>
                      {COLS.map((c, i) => (
                        <td key={c} className="px-4 h-14">
                          <div className={`h-2 bg-s3 ${i === 0 ? "w-36" : "w-12"} ${i > 0 && i < 6 ? "ml-auto" : ""}`} style={{ opacity: 0.9 - r * 0.3 }} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="border-t border-line">
              <Empty title={live ? "No markets created yet." : "No markets deployed on this network."}>
                Markets are created through MarketFactory and listed here from LensReader. The rows above are layout placeholders, not data.
              </Empty>
            </div>
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
