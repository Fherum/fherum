import { Suspense } from "react";
import { isAddress, type Address } from "viem";
import { EmbedWidget } from "@/components/embed-widget";
import { tryReadMarket, amt, pct } from "@/lib/chain";
import type { PanelMarket } from "@/components/action-panel";

// Embeddable FHERUM lending widget: <iframe src="https://fherum.tech/embed/<market>?accent=3dd68c&brand=Acme">.
// Always mainnet. Real transactions, signed in the visitor's own wallet.
type P = { params: Promise<{ market: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

export default function EmbedPage(p: P) {
  return (
    <Suspense fallback={<div className="p-6 font-mono text-xs uppercase text-mute">Loading FHERUM market…</div>}>
      <Embed {...p} />
    </Suspense>
  );
}

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

async function Embed({ params, searchParams }: P) {
  const { market } = await params;
  const q = await searchParams;
  const accentRaw = (one(q.accent) ?? "").replace(/^#/, "");
  const accent = /^[0-9a-fA-F]{6}$/.test(accentRaw) ? `#${accentRaw}` : null;
  const brand = (one(q.brand) ?? "").replace(/[^\w .·&-]/g, "").slice(0, 24) || null;
  const mode = one(q.mode) === "borrow" ? "borrow" : "earn";
  if (!isAddress(market)) return <p className="p-6 font-mono text-xs text-bad">Invalid market address.</p>;
  const r = await tryReadMarket(market as Address, "mainnet");
  if (!r.ok) return <p className="p-6 font-mono text-xs text-bad">Market unavailable: {r.error}</p>;
  const m = r.m;
  const panel: PanelMarket = {
    address: m.address,
    loan: { address: m.loan.address, symbol: m.loan.symbol, decimals: m.loan.decimals },
    collateral: { address: m.collateral.address, symbol: m.collateral.symbol, decimals: m.collateral.decimals },
    paused: m.snap.paused, borrowPaused: m.snap.borrowPaused, removeCollateralPaused: m.snap.removeCollateralPaused, repayPaused: m.snap.repayPaused,
  };
  return (
    <EmbedWidget
      market={panel}
      accent={accent}
      brand={brand}
      mode={mode}
      stats={{
        pair: `${m.collateral.symbol}/${m.loan.symbol}`,
        supplyApy: pct(m.snap.supplyRatePerYearWad),
        borrowApy: pct(m.snap.borrowRatePerYearWad),
        util: pct(m.snap.utilizationWad),
        liquidity: `${amt(m.snap.availableLiquidity, m.loan.decimals)} ${m.loan.symbol}`,
      }}
    />
  );
}
