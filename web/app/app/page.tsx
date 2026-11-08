import { PageHead } from "@/components/shell";
import { Panel, Tag } from "@/components/ui";
import { PortfolioOverview, type PortfolioMarket } from "@/components/portfolio";
import { marketsFor, tryReadMarket } from "@/lib/chain";
import { FHE_STATUS, PRIVACY_MODE } from "@/lib/protocol";
import { getNet } from "@/lib/net-server";

export default async function Overview() {
  const { net, live, chain: TARGET_CHAIN } = await getNet();
  const markets = await portfolioMarkets(net, live);
  return (
    <>
      <PageHead eyebrow="Overview" title="Your position">
        Your balances on {TARGET_CHAIN.name}, read live from chain for the connected wallet. Nothing on this page is sample data.
      </PageHead>

      <div className="grid xl:grid-cols-[1.5fr_1fr] gap-4">
        <PortfolioOverview markets={markets} mode={PRIVACY_MODE} />

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

async function portfolioMarkets(net: Parameters<typeof marketsFor>[0], live: boolean): Promise<PortfolioMarket[]> {
  if (!live) return [];
  const res = await Promise.all(marketsFor(net).map((a) => tryReadMarket(a, net)));
  return res.flatMap((r) => (r.ok ? [{ address: r.m.address, loan: { symbol: r.m.loan.symbol, decimals: r.m.loan.decimals }, collateral: { symbol: r.m.collateral.symbol, decimals: r.m.collateral.decimals } }] : []));
}
