"use client";

import { useState } from "react";
import type { HistPoint } from "@/lib/history";

type Mode = "size" | "rate";
const fmtN = (v: number) => (v >= 1e6 ? `${(v / 1e6).toFixed(2)}M` : v >= 1e3 ? `${(v / 1e3).toFixed(1)}K` : v.toFixed(v < 10 ? 2 : 0));
const fmtP = (v: number) => `${(v * 100).toFixed(2)}%`;
const fmtD = (t: number) => new Date(t).toLocaleDateString("en-US", { month: "short", day: "numeric" });

/** Market history chart from real archive reads. Empty state when there is no activity yet. */
export function MarketChart({ points, symbol, fromBlock, toBlock }: { points: HistPoint[]; symbol: string; fromBlock: string; toBlock: string }) {
  const [mode, setMode] = useState<Mode>("size");
  const [hover, setHover] = useState<number | null>(null);
  const W = 640, H = 240, P = 36;
  const series = mode === "size"
    ? [{ k: "Total supplied", c: "var(--bronze)", v: points.map((p) => p.supply), f: fmtN }, { k: "Total borrowed", c: "var(--ink)", v: points.map((p) => p.debt), f: fmtN }]
    : [{ k: "Supply APY", c: "var(--bronze)", v: points.map((p) => p.supplyApy), f: fmtP }, { k: "Borrow APY", c: "var(--ink)", v: points.map((p) => p.borrowApy), f: fmtP }];
  const max = Math.max(...series.flatMap((s) => s.v), 0);
  const empty = max === 0;
  const top = empty ? 1 : max * 1.15;
  const x = (i: number) => P + (i / Math.max(points.length - 1, 1)) * (W - 2 * P);
  const y = (v: number) => H - P - (v / top) * (H - 2 * P);
  const path = (v: number[]) => v.map((n, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(n).toFixed(1)}`).join("");
  const h = hover ?? points.length - 1;
  const fmt = series[0].f;

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-4 font-mono text-[11px] uppercase">
          {series.map((s) => (
            <span key={s.k} className="flex items-center gap-2 text-ink-2">
              <span className="inline-block w-3 h-[3px]" style={{ background: s.c }} />{s.k}
              <span className="num text-ink">{points.length ? s.f(s.v[h]) : "—"}{mode === "size" ? ` ${symbol}` : ""}</span>
            </span>
          ))}
        </div>
        <div className="flex border border-line font-mono text-[11px] uppercase" role="tablist">
          {(["size", "rate"] as Mode[]).map((m) => (
            <button key={m} role="tab" aria-selected={mode === m} onClick={() => setMode(m)}
              className={`px-3 h-7 ${mode === m ? "bg-ink text-bg" : "text-ink-2 hover:text-ink"}`}>{m === "size" ? "Size" : "APY"}</button>
          ))}
        </div>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img"
        aria-label={`${mode === "size" ? "Market size" : "Rates"} history, ${points.length} samples`}
        onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          const px = ((e.clientX - r.left) / r.width) * W;
          setHover(Math.min(points.length - 1, Math.max(0, Math.round(((px - P) / (W - 2 * P)) * (points.length - 1)))));
        }}>
        {[0, 0.5, 1].map((g) => (
          <g key={g}>
            <line x1={P} x2={W - P} y1={y(top * g)} y2={y(top * g)} stroke="var(--line)" />
            {!empty && <text x={P - 6} y={y(top * g) + 3} fill="var(--mute)" fontSize="10" textAnchor="end" fontFamily="var(--font-plex-mono)">{fmt(top * g)}</text>}
          </g>
        ))}
        {series.map((s, i) => (
          <g key={s.k}>
            {i === 0 && <path d={`${path(s.v)}L${x(points.length - 1)},${H - P}L${P},${H - P}Z`} fill={s.c} opacity="0.12" />}
            <path d={path(s.v)} fill="none" stroke={s.c} strokeWidth="2" />
          </g>
        ))}
        {points.length > 0 && <line x1={x(h)} x2={x(h)} y1={P} y2={H - P} stroke="var(--line-2)" strokeDasharray="3 3" />}
        {points.length > 0 && [0, points.length - 1].map((i) => (
          <text key={i} x={x(i)} y={H - 10} fill="var(--mute)" fontSize="10" textAnchor={i ? "end" : "start"} fontFamily="var(--font-plex-mono)">{fmtD(points[i].t)}</text>
        ))}
        {empty && <text x={W / 2} y={H / 2} fill="var(--mute)" fontSize="12" textAnchor="middle" fontFamily="var(--font-plex-mono)">NO ACTIVITY YET · CHART FILLS AS USERS SUPPLY AND BORROW</text>}
      </svg>
      <p className="font-mono text-[10px] uppercase text-mute">
        {points.length ? `${fmtD(points[h].t)} · ` : ""}{points.length} on-chain samples · blocks {fromBlock}–{toBlock} · LensReader archive reads
      </p>
    </div>
  );
}

/** Tiny supply trend for table rows. */
export function Sparkline({ values, w = 96, h = 28 }: { values: number[]; w?: number; h?: number }) {
  const max = Math.max(...values, 0);
  if (!values.length || max === 0) return <span className="font-mono text-[10px] uppercase text-mute">no activity</span>;
  const pts = values.map((v, i) => `${((i / (values.length - 1)) * w).toFixed(1)},${(h - 2 - (v / max) * (h - 4)).toFixed(1)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width={w} height={h} className="inline-block" aria-hidden>
      <polyline points={pts} fill="none" stroke="var(--bronze)" strokeWidth="1.5" />
    </svg>
  );
}
