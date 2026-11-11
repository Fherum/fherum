"use client";

import { useEffect, useState } from "react";
import type { AssaySummary } from "@/app/api/assay/route";

/** Live ASSAY figures for the landing. Shows dashes until the chain read lands; never shows guessed numbers. */
export function AssayStrip() {
  const [s, setS] = useState<AssaySummary | null>(null);
  useEffect(() => {
    let on = true;
    fetch("/api/assay").then((r) => r.json()).then((v: AssaySummary) => on && setS(v)).catch(() => on && setS({ ok: false }));
    return () => { on = false; };
  }, []);
  const ok = s?.ok ? s : null;
  const cells: [string, string, string][] = [
    ["Stocks tracked", ok ? String(ok.tracked) : "—", "registered in ASSAY"],
    ["Risk actions open", ok ? `${ok.open} / ${ok.tracked}` : "—", "isOpen(token) = true"],
    ["Dividends recorded", ok ? String(ok.dividends) : "—", "reinvested via uiMultiplier"],
    ["Highest uplift", ok?.top ? `+${ok.top.upliftPct.toFixed(4)}%` : "—", ok?.top ? `${ok.top.symbol} · since registry baseline` : "since registry baseline"],
  ];
  return (
    <div>
      <div className="grid grid-cols-2 lg:grid-cols-4 border-2 border-[#e9e4d8] bg-[#050404]">
        {cells.map(([k, v, sub], i) => (
          <div key={k} className={`p-5 border-[#e9e4d8]/25 ${i ? "border-l" : ""} ${i === 2 ? "max-lg:border-l-0 max-lg:border-t" : ""} ${i === 3 ? "max-lg:border-t" : ""}`}>
            <div className="font-mono text-[10px] uppercase text-[#e9e4d8]/55">{k}</div>
            <div className={`mt-3 font-mono text-3xl md:text-4xl tabular-nums ${i === 3 && ok?.top ? "text-[#ff5a1f]" : ""}`}>{v}</div>
            <div className="mt-2 font-mono text-[10px] text-[#e9e4d8]/45">{sub}</div>
          </div>
        ))}
      </div>
      <p className="mt-2 font-mono text-[10px] uppercase text-[#e9e4d8]/45">
        {s === null ? "Reading ASSAY registry from Robinhood Chain…" : ok ? `Live read · Robinhood Chain mainnet · ${new Date(ok.asOf).toISOString().slice(11, 16)} UTC` : "Chain read unavailable right now · open the registry for the live view"}
      </p>
    </div>
  );
}
