import Link from "next/link";
import { PageHead } from "@/components/shell";
import { Panel, Empty, Tag } from "@/components/ui";
import { FHE_STATUS, PRIVACY_MODE, TARGET_CHAIN, isDeployed } from "@/lib/protocol";

export default function Overview() {
  const live = isDeployed();
  return (
    <>
      <PageHead eyebrow="Overview" title="Your position">
        Balances appear here once you connect and a market exists on {TARGET_CHAIN.name}. Nothing on this page is sample data.
      </PageHead>

      <div className="grid xl:grid-cols-[1.5fr_1fr] gap-4">
        <Panel title="Portfolio" aside={<Tag tone="warn">{PRIVACY_MODE} mode</Tag>}>
          <div className="grid sm:grid-cols-3 border-b border-line">
            {["Supplied", "Collateral", "Borrowed"].map((k, i) => (
              <div key={k} className={`p-5 ${i ? "sm:border-l border-line" : ""}`}>
                <div className="eyebrow mb-3">{k}</div>
                <div className="num font-mono text-2xl text-line-2" aria-label="No data">—</div>
              </div>
            ))}
          </div>
          <Empty title="No position yet."
            action={<Link href="/app/markets" className="text-sm text-bronze hover:underline underline-offset-4">Browse markets →</Link>}>
            When you supply or borrow, your collateral, debt and Health Factor appear here, each labelled as confirmed, pending or estimated.
          </Empty>
        </Panel>

        <Panel title="Health">
          <div className="p-5 grid gap-4">
            <div className="flex items-end justify-between">
              <span className="num font-display text-6xl leading-none text-line-2">—</span>
              <Tag>No debt</Tag>
            </div>
            <div className="h-px bg-line-2 relative"><span className="absolute -top-2 h-4 w-px bg-bad/70" style={{ left: "33.3%" }} /></div>
            <p className="text-xs text-mute leading-relaxed">Below 1.00 a position can be liquidated. Health Factor is computed from oracle prices and the market&apos;s liquidation threshold.</p>
          </div>
        </Panel>

        <Panel title="System status" className="xl:col-span-2">
          <ul className="grid md:grid-cols-4">
            {[
              ["Contracts", live ? "Deployed" : "Not deployed", live ? "ok" : "mute"],
              ["Oracle", live ? "Read per market" : "—", "mute"],
              ["FHE service", "Unavailable on this chain", "warn"],
              ["Indexer", "Not running", "mute"],
            ].map(([k, v, t], i) => (
              <li key={k} className={`p-5 grid gap-2 ${i ? "md:border-l border-t md:border-t-0 border-line" : ""}`}>
                <span className="eyebrow">{k}</span>
                <Tag tone={t as "ok" | "warn" | "mute"}>{v}</Tag>
              </li>
            ))}
          </ul>
          <p className="px-5 pb-5 text-xs text-mute">{FHE_STATUS}</p>
        </Panel>
      </div>
    </>
  );
}
