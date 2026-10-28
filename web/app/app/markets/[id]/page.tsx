import { Suspense } from "react";
import Link from "next/link";
import { PageHead } from "@/components/shell";
import { Empty, Panel, Tag } from "@/components/ui";
import { RateCurve } from "@/components/rate-curve";
import { ActionPanel } from "@/components/action-panel";
import { DEPLOYMENT, FHE_STATUS, HARD_BOUNDS, PRIVACY_MODE, TARGET_CHAIN, isDeployed } from "@/lib/protocol";
import { amt, pct, ray, tryReadMarket, wadNum, type MarketView, type Snapshot } from "@/lib/chain";

type Fmt = "pct" | "loan" | "col" | "ray" | "wad" | "usd";
// Field groups mirror LensReader.MarketSnapshot (src/LensReader.sol). Values only come from snapshot(market).
const GROUPS: { title: string; rows: [string, keyof Snapshot, Fmt][] }[] = [
  { title: "Liquidity", rows: [["Total supplied", "totalSupplyAssets", "loan"], ["Total borrowed", "totalDebtAssets", "loan"], ["Available liquidity", "availableLiquidity", "loan"], ["Utilization", "utilizationWad", "pct"], ["Total collateral", "totalCollateral", "col"]] },
  { title: "Rates · variable", rows: [["Supply rate / yr", "supplyRatePerYearWad", "pct"], ["Borrow rate / yr", "borrowRatePerYearWad", "pct"], ["Reserve factor", "reserveFactorWad", "pct"], ["Supply index", "supplyIndex", "ray"], ["Borrow index", "borrowIndex", "ray"]] },
  { title: "Risk parameters", rows: [["Loan-to-value", "ltvWad", "pct"], ["Liquidation threshold", "liquidationThresholdWad", "pct"], ["Liquidation bonus", "liquidationBonusWad", "wad"], ["Close factor", "closeFactorWad", "pct"], ["Dust value", "dustValueWad", "usd"]] },
  { title: "Caps", rows: [["Supply cap", "supplyCap", "loan"], ["Borrow cap", "borrowCap", "loan"], ["Wallet supply cap", "walletSupplyCap", "loan"], ["Wallet borrow cap", "walletBorrowCap", "loan"]] },
];
const PAUSES: [string, keyof Snapshot][] = [["Market", "paused"], ["Borrow", "borrowPaused"], ["Remove collateral", "removeCollateralPaused"], ["Liquidation", "liquidationPaused"], ["Repay", "repayPaused"]];
const ZERO = "0x0000000000000000000000000000000000000000";

const isAddr = (s: string) => /^0x[0-9a-fA-F]{40}$/.test(s);
const short = (s: string) => (s.length > 14 ? `${s.slice(0, 6)}…${s.slice(-4)}` : s);

function fmt(m: MarketView, key: keyof Snapshot, f: Fmt) {
  const v = m.snap[key] as bigint;
  switch (f) {
    case "pct": return pct(v);
    case "loan": return `${amt(v, m.loan.decimals)} ${m.loan.symbol}`;
    case "col": return `${amt(v, m.collateral.decimals)} ${m.collateral.symbol}`;
    case "ray": return ray(v);
    case "wad": return `×${wadNum(v)}`;
    case "usd": return `$${amt(v, 18)}`;
  }
}

function Addr({ a }: { a: string }) {
  const href = DEPLOYMENT.explorer ? `${DEPLOYMENT.explorer.replace(/\/$/, "")}/address/${a}` : null;
  return href
    ? <a href={href} target="_blank" rel="noreferrer" className="break-all hover:text-bronze underline decoration-line-2">{a}</a>
    : <span className="break-all">{a}</span>;
}

function Body({ id, m, error, loading }: { id: string; m?: MarketView; error?: string; loading?: boolean }) {
  const live = isDeployed();
  const note = loading ? "reading LensReader…" : m ? "LensReader · live" : live ? "read failed" : "no data · not deployed";
  const kpis: [string, string | null][] = [
    ["Supply rate", m ? pct(m.snap.supplyRatePerYearWad) : null],
    ["Borrow rate", m ? pct(m.snap.borrowRatePerYearWad) : null],
    ["Utilization", m ? pct(m.snap.utilizationWad) : null],
    ["Liquidity", m ? amt(m.snap.availableLiquidity, m.loan.decimals, 0) : null],
  ];
  return (
    <div className="grid 2xl:grid-cols-[1fr_380px] gap-6 items-start">
      <div className="grid gap-6 min-w-0">
        <div className="grid sm:grid-cols-2 xl:grid-cols-4 border-2 border-ink">
          {kpis.map(([k, v], i) => (
            <div key={k} className={`p-5 ${i ? "border-t-2 sm:border-t-0 sm:border-l-2" : ""} border-ink`}>
              <p className="font-mono text-[10px] uppercase text-mute">{k}{k === "Liquidity" && m ? ` · ${m.loan.symbol}` : ""}</p>
              <p className={`font-stencil text-6xl leading-none mt-2 ${v ? "text-ink" : "text-ink-2"}`}>{v ?? "—"}</p>
              <p className="font-mono text-[10px] uppercase text-mute mt-2">{note}</p>
            </div>
          ))}
        </div>

        {!live && (
          <Panel title="Status">
            <Empty title="This market is not live.">
              No contracts are configured for {TARGET_CHAIN.name}, so there is no state to read for this address. Values appear here once LensReader is configured.
            </Empty>
          </Panel>
        )}
        {live && error && (
          <Panel title="Status">
            <Empty title="Could not read this market.">
              LensReader.snapshot({short(id)}) failed on {TARGET_CHAIN.name}. The address may not be a FHERUM market, or the RPC is unreachable.
              <span className="block mt-3 font-mono text-[11px] text-mute break-all">{error}</span>
            </Empty>
          </Panel>
        )}

        <div className="grid lg:grid-cols-2 gap-6">
          {GROUPS.map((g) => (
            <Panel key={g.title} title={g.title}>
              <ul>
                {g.rows.map(([label, field, f]) => (
                  <li key={field} className="flex justify-between gap-4 px-5 py-3 border-b border-line last:border-0 text-sm">
                    <span className="text-ink-2">{label}<span className="block font-mono text-[10px] text-mute">{field}</span></span>
                    <span className={`num font-mono self-center text-right ${m ? "text-ink" : "text-ink-2"}`}>{m ? fmt(m, field, f) : "—"}</span>
                  </li>
                ))}
              </ul>
            </Panel>
          ))}
        </div>

        <div className="grid lg:grid-cols-2 gap-6">
          <Panel title="Rate model · illustration"><div className="p-5"><RateCurve /></div></Panel>
          <Panel title="Pause switches · Breakglass">
            <ul>
              {PAUSES.map(([label, field]) => {
                const on = m ? (m.snap[field] as boolean) : null;
                return (
                  <li key={field} className="flex justify-between gap-4 px-5 py-3 border-b border-line last:border-0 text-sm">
                    <span className="text-ink-2">{label}<span className="block font-mono text-[10px] text-mute">{field}</span></span>
                    <span className={`font-mono text-[11px] uppercase self-center ${on === null ? "text-mute" : on ? "text-bad" : "text-ok"}`}>
                      {on === null ? "unknown" : on ? "■ Paused" : "● Active"}
                    </span>
                  </li>
                );
              })}
            </ul>
          </Panel>
        </div>

        <div className="grid lg:grid-cols-2 gap-6">
          <Panel title="Privacy · Veilbook">
            <div className="p-5 grid gap-3 text-sm">
              <p className="font-stencil text-4xl uppercase leading-none">{m ? (m.snap.privacyMode === 0 ? "Public" : `Mode ${m.snap.privacyMode}`) : PRIVACY_MODE}</p>
              <p className="text-ink-2 leading-relaxed">{FHE_STATUS}</p>
              <p className="text-xs text-mute">Market aggregates (totals, utilization, rates) stay public in every mode. Only borrower positions are encrypted once FHE is available.</p>
            </div>
          </Panel>
          <Panel title="Hard bounds · enforced in contract">
            <ul>
              {HARD_BOUNDS.map((b) => (
                <li key={b.param} className="flex justify-between gap-4 px-5 py-3 border-b border-line last:border-0 text-sm">
                  <span className="text-ink-2">{b.param}</span><span className="num font-mono text-ink">{b.rule}</span>
                </li>
              ))}
            </ul>
          </Panel>
        </div>

        <Panel title="Contracts">
          <div className="p-5 grid gap-2 font-mono text-xs">
            {([
              ["Market", id],
              ["Collateral", m ? m.collateral.address : "—"],
              ["Loan", m ? m.loan.address : "—"],
              ["Oracle", m?.oracle ?? "—"],
              ["Curator", m?.curator ?? "—"],
              ["Eligibility", m ? (m.snap.eligibility === ZERO ? "none (open)" : m.snap.eligibility) : "—"],
            ] as [string, string][]).map(([k, v]) => (
              <p key={k}><span className="text-mute uppercase mr-3 inline-block w-24">{k}</span>{isAddr(v) ? <Addr a={v} /> : v}</p>
            ))}
            {m && <p className="mt-2 text-mute normal-case">Curator is the ForgeAdmin timelock — risk changes wait out its delay.</p>}
          </div>
        </Panel>
      </div>
      <div className="2xl:sticky 2xl:top-24"><ActionPanel /></div>
    </div>
  );
}

async function Live({ id }: { id: `0x${string}` }) {
  const r = await tryReadMarket(id);
  return r.ok ? <Body id={id} m={r.m} /> : <Body id={id} error={r.error} />;
}

export default async function MarketDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const live = isDeployed();
  const valid = isAddr(id);

  return (
    <>
      <Link href="/app/markets" className="inline-block mb-6 font-mono text-xs uppercase text-ink-2 hover:text-bronze">← All markets</Link>
      <PageHead eyebrow={`Forgehub · market ${short(id)}`} title="Market"
        aside={<div className="flex flex-wrap gap-2"><Tag>{TARGET_CHAIN.name}</Tag><Tag>Privacy · {PRIVACY_MODE}</Tag><Tag tone={live ? "ok" : "mute"}>{live ? "Deployed · testnet" : "Not deployed"}</Tag></div>}>
        One collateral asset, one loan asset, curator-set limits inside contract hard bounds. Every figure below is read from LensReader.snapshot(market) — nothing is shown until that call returns.
      </PageHead>

      {!valid && (
        <div className="mb-8 border-2 border-bad p-4 font-mono text-xs uppercase text-bad">Invalid market address. Markets are identified by their contract address (0x + 40 hex).</div>
      )}

      {live && valid
        ? <Suspense fallback={<Body id={id} loading />}><Live id={id as `0x${string}`} /></Suspense>
        : <Body id={id} />}
    </>
  );
}
