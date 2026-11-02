import { PageHead } from "@/components/shell";
import { Empty, Panel, Th } from "@/components/ui";

export default function Activity() {
  return (
    <>
      <PageHead eyebrow="Activity" title="Activity">Supply, borrow, repay, withdraw, liquidation and market-configuration events, each with its transaction and status.</PageHead>
      <Panel title="Events" aside={<div className="flex gap-1 font-mono text-[11px]">{["All", "Mine", "Market"].map((f, i) => <span key={f} className={`px-2 py-1 border ${i ? "border-line text-mute" : "border-line-2 text-ink"}`}>{f}</span>)}</div>}>
        <table className="w-full text-sm"><thead className="border-b border-line"><tr><Th>Event</Th><Th>Market</Th><Th right>Amount</Th><Th>Status</Th><Th right>Tx</Th></tr></thead></table>
        <Empty title="No events yet.">Pending actions show here immediately and are marked final only after confirmation. Today every field is public; FHE privacy mode, when it ships, would redact private fields for everyone but you.</Empty>
      </Panel>
    </>
  );
}
