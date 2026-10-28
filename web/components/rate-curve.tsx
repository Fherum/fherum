"use client";

import { useState } from "react";
import { borrowRate, fmtPct } from "@/lib/math";

/** Kinked rate curve. Parameters are user-adjustable illustrations, never presented as live. */
export function RateCurve() {
  const [uOpt, setUOpt] = useState(0.8);
  const [r0] = useState(0);
  const [s1, setS1] = useState(0.04);
  const [s2, setS2] = useState(0.6);
  const [u, setU] = useState(0.62);
  const W = 560, H = 220, P = 28;
  const max = r0 + s1 + s2;
  const x = (v: number) => P + v * (W - 2 * P);
  const y = (r: number) => H - P - (r / max) * (H - 2 * P);
  const pts = Array.from({ length: 101 }, (_, i) => i / 100).map((v) => `${x(v)},${y(borrowRate(v, r0, s1, s2, uOpt))}`).join(" ");
  const rb = borrowRate(u, r0, s1, s2, uOpt);

  return (
    <div className="grid gap-4">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img"
        aria-label={`Borrow rate curve. At ${fmtPct(u, 0)} utilization the borrow rate is ${fmtPct(rb)}.`}>
        {[0, 0.25, 0.5, 0.75, 1].map((g) => (
          <g key={g}>
            <line x1={x(g)} x2={x(g)} y1={P} y2={H - P} stroke="var(--line)" />
            <text x={x(g)} y={H - 8} fill="var(--mute)" fontSize="10" textAnchor="middle" fontFamily="var(--font-plex-mono)">{g * 100}%</text>
          </g>
        ))}
        <line x1={P} x2={W - P} y1={H - P} y2={H - P} stroke="var(--line-2)" />
        <line x1={x(uOpt)} x2={x(uOpt)} y1={P} y2={H - P} stroke="var(--bronze)" strokeDasharray="2 4" />
        <text x={x(uOpt) + 6} y={P + 10} fill="var(--bronze)" fontSize="10" fontFamily="var(--font-plex-mono)">U_opt</text>
        <polyline points={pts} fill="none" stroke="var(--ink)" strokeWidth="1.5" />
        <line x1={x(u)} x2={x(u)} y1={y(rb)} y2={H - P} stroke="var(--ink-2)" strokeWidth=".75" />
        <rect x={x(u) - 4} y={y(rb) - 4} width="8" height="8" transform={`rotate(45 ${x(u)} ${y(rb)})`} fill="var(--ink)" />
        <text x={x(u) + 10} y={y(rb) - 8} fill="var(--ink)" fontSize="11" fontFamily="var(--font-plex-mono)">{fmtPct(rb)}</text>
      </svg>
      <div className="grid grid-cols-2 gap-x-6 gap-y-4 text-xs">
        {([
          ["Utilization", u, setU, 0, 1, 0.01],
          ["Optimal U", uOpt, setUOpt, 0.5, 0.95, 0.01],
          ["Slope 1", s1, setS1, 0, 0.2, 0.005],
          ["Slope 2", s2, setS2, 0, 2, 0.05],
        ] as const).map(([l, v, set, mn, mx, st]) => (
          <label key={l} className="grid gap-1.5 min-w-0">
            <span className="flex justify-between text-mute"><span>{l}</span><span className="num font-mono text-ink">{fmtPct(v, l.startsWith("Slope") ? 1 : 0)}</span></span>
            <input type="range" min={mn} max={mx} step={st} value={v} onChange={(e) => set(Number(e.target.value))} className="w-full min-w-0" />
          </label>
        ))}
      </div>
    </div>
  );
}
