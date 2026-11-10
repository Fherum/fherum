import { PageHead } from "@/components/shell";
import { Empty, Panel, Th } from "@/components/ui";
import { PAUSE_MATRIX, ROLES } from "@/lib/protocol";
import { Suspense } from "react";
import { getNet } from "@/lib/net-server";
import { marketsFor, tryReadMarket } from "@/lib/chain";
import { readCurator, readTargetHf, SELECTOR_LABEL } from "@/lib/curator";
import { DEPLOYMENTS } from "@/lib/deployments";
import { CuratorConsole, type CuratedMarket } from "@/components/curator-console";

export default function Curator() {
  return (
    <>
      <PageHead eyebrow="Forgehub · Risk curation" title="Risk curator">
        Every FHERUM market is managed by an independent risk curator. The curator sets supply and borrow caps, LTV, liquidation thresholds and rate curves to keep each market solvent. Every change waits 48 hours in a public timelock, stays inside hard limits enforced by the contract, and can never touch user funds.
      </PageHead>
      <div className="grid gap-4">
        <Panel title="Curator mandate">
          <ul className="grid sm:grid-cols-2 lg:grid-cols-4">
            {[
              ["01 · Risk parameters", "Sets LTV, liquidation threshold, liquidation bonus and reserve factor per market."],
              ["02 · Exposure caps", "Sizes total and per-wallet supply and borrow caps to available liquidity."],
              ["03 · Rate curves", "Tunes base rate, slopes and the utilization kink so lenders are paid for risk."],
              ["04 · Public accountability", "Every action is an on-chain event. 48h timelock, hard bounds, Safe 2-of-3 can cancel."],
            ].map(([t, d], i) => (
              <li key={t} className={`p-5 grid gap-2 content-start border-line ${i ? "border-l" : ""} max-sm:border-l-0 max-sm:border-t`}>
                <span className="font-mono text-xs uppercase text-bronze">{t}</span>
                <span className="text-sm text-ink-2">{d}</span>
              </li>
            ))}
          </ul>
        </Panel>
        <Suspense fallback={<Panel title="Curator console"><p className="px-6 py-10 text-mute text-xs">Reading registry and timelock from chain…</p></Panel>}><Live /></Suspense>
        <Panel title="Permission matrix">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="border-b border-line"><tr><Th>Role</Th><Th>Held by</Th><Th>Can</Th><Th>Cannot</Th></tr></thead>
              <tbody>
                {ROLES.map((r) => (
                  <tr key={r.role} className="border-b border-line last:border-0 align-top">
                    <td className="px-4 py-4 text-ink">{r.role}</td>
                    <td className="px-4 py-4 text-mute text-xs">{r.holder}</td>
                    <td className="px-4 py-4"><ul className="grid gap-1 text-ink-2">{r.can.map((c) => <li key={c}><span aria-hidden className="text-ok">+ </span>{c}</li>)}</ul></td>
                    <td className="px-4 py-4"><ul className="grid gap-1 text-mute">{r.cannot.map((c) => <li key={c}><span aria-hidden className="text-bad">− </span>{c}</li>)}</ul></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
        <Panel title="Under pause">
          <ul className="grid sm:grid-cols-3 lg:grid-cols-6">
            {PAUSE_MATRIX.map((p, i) => (
              <li key={p.action} className={`p-5 grid gap-2 border-line ${i ? "border-l" : ""} max-sm:border-l-0 max-sm:border-t`}>
                <span className="text-sm text-ink-2">{p.action}</span>
                <span className={`font-mono text-xs ${p.paused ? "text-bad" : "text-ok"}`}>{p.paused ? "■ Stops" : "● Continues"}</span>
              </li>
            ))}
          </ul>
        </Panel>
      </div>
    </>
  );
}

async function Live() {
  const { net, live } = await getNet();
  if (!live) return <Panel title="Curator console"><Empty title="No deployment on this network." /></Panel>;
  const [data, reads] = await Promise.all([readCurator(net), Promise.all(marketsFor(net).map((a) => tryReadMarket(a, net)))]);
  if (!data) return <Panel title="Curator console"><Empty title="Could not read the registry.">The RPC did not answer. Nothing is shown rather than guessed. Reload to retry.</Empty></Panel>;
  const ok = reads.flatMap((r) => (r.ok ? [r.m] : []));
  const hfs = await Promise.all(ok.map((m) => readTargetHf(net, m.address)));
  const markets: CuratedMarket[] = ok.map((m, i) => ({
    address: m.address,
    label: `${m.collateral.symbol} / ${m.loan.symbol}`,
    loan: { symbol: m.loan.symbol, decimals: m.loan.decimals },
    caps: { supply: m.snap.supplyCap.toString(), borrow: m.snap.borrowCap.toString(), walletSupply: m.snap.walletSupplyCap.toString(), walletBorrow: m.snap.walletBorrowCap.toString() },
    totals: { supply: m.snap.totalSupplyAssets.toString(), debt: m.snap.totalDebtAssets.toString() },
    utilWad: m.snap.utilizationWad.toString(),
    ltvWad: m.snap.ltvWad.toString(),
    ltWad: m.snap.liquidationThresholdWad.toString(),
    targetHfWad: hfs[i]?.toString() ?? null,
    paused: { any: m.snap.paused, borrow: m.snap.borrowPaused, removeCollateral: m.snap.removeCollateralPaused, liquidation: m.snap.liquidationPaused },
  }));
  const labelOf = new Map(data.queue.map((q) => [q.id, SELECTOR_LABEL[q.selector] ?? q.selector]));
  return (
    <CuratorConsole
      registry={data.registry}
      minDelay={data.minDelay}
      markets={markets}
      queue={data.queue.map((q) => ({ id: q.id, market: q.market, label: labelOf.get(q.id)!, eta: q.eta, queuedTx: q.queuedTx, state: q.state }))}
      log={data.events.map((e) => ({ kind: e.kind, id: e.id, label: labelOf.get(e.id), market: e.market, tx: e.tx, block: e.block }))}
      explorer={DEPLOYMENTS[net].explorer ?? undefined}
      scannedTo={data.scannedTo}
      scanning={data.scanning}
    />
  );
}
