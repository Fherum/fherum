import { PageHead } from "@/components/shell";
import { Empty, Panel, Tag } from "@/components/ui";
import { isDeployed } from "@/lib/protocol";

const METRICS = ["Total supplied", "Total borrowed", "Available liquidity", "Utilization"];

export default function Lens() {
  return (
    <>
      <PageHead eyebrow="Steel Lens" title="Public market data"
        aside={<Tag tone={isDeployed() ? "ok" : "mute"}>{isDeployed() ? "Direct on-chain read" : "No source configured"}</Tag>}>
        Aggregates only. No individual position is ever shown here. Every value states whether it came from a direct LensReader call or an indexer, and when.
      </PageHead>
      <div className="grid gap-4">
        <div className="grid grid-cols-2 lg:grid-cols-4 border border-line bg-s1">
          {METRICS.map((m, i) => (
            <div key={m} className={`p-5 ${i ? "border-l border-line" : ""} ${i === 2 ? "border-l-0 lg:border-l border-t lg:border-t-0" : ""} ${i === 3 ? "border-t lg:border-t-0" : ""}`}>
              <div className="eyebrow mb-3">{m}</div>
              <div className="num font-mono text-2xl text-line-2">—</div>
              <div className="font-mono text-[10px] text-mute mt-2">last read: never</div>
            </div>
          ))}
        </div>
        <div className="grid lg:grid-cols-2 gap-4">
          <Panel title="Oracle health"><Empty title="No feeds to monitor.">Each market shows its feed, last update and staleness window. Stale prices block borrowing and collateral withdrawal.</Empty></Panel>
          <Panel title="Utilization & rate history"><Empty title="No history yet.">Charts appear once an indexer has recorded real blocks. We do not backfill or interpolate.</Empty></Panel>
          <Panel title="Liquidity concentration"><Empty title="Hidden below a cohort minimum.">Concentration is published only when enough positions exist that no single borrower can be inferred.</Empty></Panel>
          <Panel title="Protocol events"><Empty title="No events indexed.">Curator changes, pauses and liquidations appear here with block numbers.</Empty></Panel>
        </div>
      </div>
    </>
  );
}
