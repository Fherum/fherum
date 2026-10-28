import Link from "next/link";
import { PageHead } from "@/components/shell";
import { Empty, Panel, Tag } from "@/components/ui";
import { RateCurve } from "@/components/rate-curve";
import { ActionPanel } from "@/components/action-panel";
import { FHE_STATUS, HARD_BOUNDS, PRIVACY_MODE, TARGET_CHAIN, isDeployed } from "@/lib/protocol";

// Field groups mirror LensReader.MarketSnapshot (src/LensReader.sol). No values until a deployment exists.
const GROUPS: { title: string; rows: [string, string][] }[] = [
  { title: "Liquidity", rows: [["Total supplied", "totalSupplyAssets"], ["Total borrowed", "totalDebtAssets"], ["Available liquidity", "availableLiquidity"], ["Utilization", "utilizationWad"], ["Total collateral", "totalCollateral"]] },
  { title: "Rates · variable", rows: [["Supply rate / yr", "supplyRatePerYearWad"], ["Borrow rate / yr", "borrowRatePerYearWad"], ["Reserve factor", "reserveFactorWad"], ["Supply index", "supplyIndex"], ["Borrow index", "borrowIndex"]] },
  { title: "Risk parameters", rows: [["Loan-to-value", "ltvWad"], ["Liquidation threshold", "liquidationThresholdWad"], ["Liquidation bonus", "liquidationBonusWad"], ["Close factor", "closeFactorWad"], ["Dust value", "dustValueWad"]] },
  { title: "Caps", rows: [["Supply cap", "supplyCap"], ["Borrow cap", "borrowCap"], ["Wallet supply cap", "walletSupplyCap"], ["Wallet borrow cap", "walletBorrowCap"]] },
];
const PAUSES = [["Market", "paused"], ["Borrow", "borrowPaused"], ["Remove collateral", "removeCollateralPaused"], ["Liquidation", "liquidationPaused"], ["Repay", "repayPaused"]];

const isAddr = (s: string) => /^0x[0-9a-fA-F]{40}$/.test(s);
const short = (s: string) => (s.length > 14 ? `${s.slice(0, 6)}…${s.slice(-4)}` : s);

export default async function MarketDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const live = isDeployed();
  const valid = isAddr(id);

  return (
    <>
      <Link href="/app/markets" className="inline-block mb-6 font-mono text-xs uppercase text-ink-2 hover:text-bronze">← All markets</Link>
      <PageHead eyebrow={`Forgehub · market ${short(id)}`} title="Market"
        aside={<div className="flex flex-wrap gap-2"><Tag>{TARGET_CHAIN.name}</Tag><Tag>Privacy · {PRIVACY_MODE}</Tag><Tag>{live ? "Deployed" : "Not deployed"}</Tag></div>}>
        One collateral asset, one loan asset, curator-set limits inside contract hard bounds. Every figure below is read from LensReader.snapshot(market) — nothing is shown until that call returns.
      </PageHead>

      {!valid && (
        <div className="mb-8 border-2 border-bad p-4 font-mono text-xs uppercase text-bad">Invalid market address. Markets are identified by their contract address (0x + 40 hex).</div>
      )}

      <div className="grid 2xl:grid-cols-[1fr_380px] gap-6 items-start">
        <div className="grid gap-6 min-w-0">
          <div className="grid sm:grid-cols-2 xl:grid-cols-4 border-2 border-ink">
            {["Supply rate", "Borrow rate", "Utilization", "Liquidity"].map((k, i) => (
              <div key={k} className={`p-5 ${i ? "border-t-2 sm:border-t-0 sm:border-l-2" : ""} border-ink`}>
                <p className="font-mono text-[10px] uppercase text-mute">{k}</p>
                <p className="font-stencil text-6xl leading-none mt-2 text-ink-2">—</p>
                <p className="font-mono text-[10px] uppercase text-mute mt-2">{live ? "loading" : "no data · not deployed"}</p>
              </div>
            ))}
          </div>

          {!live && (
            <Panel title="Status">
              <Empty title="This market is not live.">
                No contracts are deployed on {TARGET_CHAIN.name} yet, so there is no state to read for this address. Values appear here once LensReader is configured.
              </Empty>
            </Panel>
          )}

          <div className="grid lg:grid-cols-2 gap-6">
            {GROUPS.map((g) => (
              <Panel key={g.title} title={g.title}>
                <ul>
                  {g.rows.map(([label, field]) => (
                    <li key={field} className="flex justify-between gap-4 px-5 py-3 border-b border-line last:border-0 text-sm">
                      <span className="text-ink-2">{label}<span className="block font-mono text-[10px] text-mute">{field}</span></span>
                      <span className="num font-mono text-ink-2 self-center">—</span>
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
                {PAUSES.map(([label, field]) => (
                  <li key={field} className="flex justify-between gap-4 px-5 py-3 border-b border-line last:border-0 text-sm">
                    <span className="text-ink-2">{label}<span className="block font-mono text-[10px] text-mute">{field}</span></span>
                    <span className="font-mono text-[11px] uppercase text-mute self-center">unknown</span>
                  </li>
                ))}
              </ul>
            </Panel>
          </div>

          <div className="grid lg:grid-cols-2 gap-6">
            <Panel title="Privacy · Veilbook">
              <div className="p-5 grid gap-3 text-sm">
                <p className="font-stencil text-4xl uppercase leading-none">{PRIVACY_MODE}</p>
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

          <Panel title="Contract">
            <div className="p-5 grid gap-2 font-mono text-xs">
              <p className="break-all"><span className="text-mute uppercase mr-3">Market</span>{id}</p>
              <p><span className="text-mute uppercase mr-3">Eligibility</span>—</p>
              <p><span className="text-mute uppercase mr-3">Explorer</span>—</p>
            </div>
          </Panel>
        </div>
        <div className="2xl:sticky 2xl:top-24"><ActionPanel /></div>
      </div>
    </>
  );
}
