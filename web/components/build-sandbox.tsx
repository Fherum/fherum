"use client";

import { useState } from "react";

export type SandboxMarket = { pair: string; address: string; supplyApy: string; util: string; liquidity: string; loan: string };

const ACCENTS = ["#ff5a1f", "#3dd68c", "#4f8cff", "#e6c35c", "#c86bfa"];

/** "Your lending market" preview: branding is mock (preview), market numbers are read live from chain. */
export function BuildSandbox({ markets }: { markets: SandboxMarket[] }) {
  const [brand, setBrand] = useState("Acme Earn");
  const [accent, setAccent] = useState(ACCENTS[1]);
  const [idx, setIdx] = useState(0);
  const m = markets[idx];
  return (
    <div className="grid lg:grid-cols-[1fr_1.2fr]">
      <div className="p-5 grid gap-4 content-start border-b lg:border-b-0 lg:border-r border-line">
        <label className="grid gap-1.5">
          <span className="eyebrow">Brand name</span>
          <input value={brand} maxLength={24} onChange={(e) => setBrand(e.target.value)}
            className="h-9 bg-s1 border border-line px-3 text-sm" />
        </label>
        <div className="grid gap-1.5">
          <span className="eyebrow">Accent</span>
          <div className="flex gap-2">
            {ACCENTS.map((c) => (
              <button key={c} type="button" aria-label={`Accent ${c}`} onClick={() => setAccent(c)}
                className={`size-7 border ${c === accent ? "border-ink" : "border-line"}`} style={{ background: c }} />
            ))}
          </div>
        </div>
        <label className="grid gap-1.5">
          <span className="eyebrow">FHERUM market</span>
          <select value={idx} onChange={(e) => setIdx(Number(e.target.value))} className="h-9 bg-s1 border border-line px-2 text-sm">
            {markets.map((x, i) => <option key={x.address} value={i}>{x.pair}</option>)}
          </select>
        </label>
        <p className="text-xs text-mute leading-relaxed">
          Brand and colours are a preview. Rate, utilization and liquidity on the right are read live from the FHERUM market on Robinhood Chain.
        </p>
      </div>
      <div className="p-5 grid place-items-center bg-s1">
        {m ? (
          <div className="w-full max-w-sm border border-line bg-bg" style={{ borderTop: `3px solid ${accent}` }}>
            <div className="px-4 py-3 flex items-center justify-between border-b border-line">
              <span className="font-mono text-sm text-ink">{brand || "Your app"}</span>
              <span className="font-mono text-[10px] uppercase text-mute">preview</span>
            </div>
            <div className="p-4 grid gap-4">
              <div>
                <div className="font-mono text-[10px] uppercase text-mute">Earn {m.loan}</div>
                <div className="font-mono text-3xl" style={{ color: accent }}>{m.supplyApy}</div>
                <div className="font-mono text-[10px] text-mute">variable supply APY · live</div>
              </div>
              <div className="grid grid-cols-2 gap-2 font-mono text-xs">
                <div className="border border-line p-2"><div className="text-mute text-[10px] uppercase">Utilization</div><div className="text-ink">{m.util}</div></div>
                <div className="border border-line p-2"><div className="text-mute text-[10px] uppercase">Available</div><div className="text-ink">{m.liquidity} {m.loan}</div></div>
              </div>
              <button type="button" disabled className="h-10 font-mono text-xs uppercase text-bg opacity-90" style={{ background: accent }}>
                Deposit {m.loan}
              </button>
              <div className="font-mono text-[10px] text-mute text-center">Powered by FHERUM · {m.pair}</div>
            </div>
          </div>
        ) : <p className="text-sm text-mute">No market data available right now.</p>}
      </div>
    </div>
  );
}
