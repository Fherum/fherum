"use client";

import { useMemo, useState } from "react";
import { healthFactor, repayToTarget, fmtUsd, fmtHf } from "@/lib/math";

function Slider({
  id, label, value, min, max, step, onChange, fmt,
}: {
  id: string; label: string; value: number; min: number; max: number; step: number;
  onChange: (n: number) => void; fmt: (n: number) => string;
}) {
  return (
    <div className="grid gap-2">
      <div className="flex items-baseline justify-between">
        <label htmlFor={id} className="text-sm text-ink-2">{label}</label>
        <output htmlFor={id} className="num font-mono text-sm text-ink">{fmt(value)}</output>
      </div>
      <input id={id} type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(Number(e.target.value))} className="w-full" />
    </div>
  );
}

/** Interactive worked example. Starts at the brief's illustration: $10,000 · 80% · $5,000 → 1.60. */
export function HealthFactorLab() {
  const [c, setC] = useState(10_000);
  const [lt, setLt] = useState(0.8);
  const [d, setD] = useState(5_000);
  const hf = useMemo(() => healthFactor(c, lt, d), [c, lt, d]);
  const state = hf >= 1.25 ? "ok" : hf >= 1 ? "warn" : "bad";
  const label = { ok: "Healthy", warn: "Near threshold", bad: "Liquidatable" }[state];
  const glyph = { ok: "●", warn: "▲", bad: "■" }[state];
  const color = { ok: "text-ok", warn: "text-warn", bad: "text-bad" }[state];
  const repay = hf < 1 ? repayToTarget(c, lt, d, 1.05, 1.1) : null;

  // Gauge: HF 0 → 3 on a hairline scale, threshold at 1.
  const pos = Math.min(Number.isFinite(hf) ? hf : 3, 3) / 3;

  return (
    <div className="grid md:grid-cols-[1fr_1.1fr] border border-line bg-s1">
      <div className="p-6 md:p-8 grid gap-6 border-b md:border-b-0 md:border-r border-line content-start">
        <Slider id="c" label="Collateral value" value={c} min={0} max={20_000} step={100} onChange={setC} fmt={fmtUsd} />
        <Slider id="lt" label="Liquidation threshold" value={lt} min={0.5} max={0.95} step={0.01} onChange={setLt} fmt={(n) => `${Math.round(n * 100)}%`} />
        <Slider id="d" label="Debt value" value={d} min={0} max={15_000} step={100} onChange={setD} fmt={fmtUsd} />
        <p className="text-xs text-mute leading-relaxed pretty">
          Illustration only. Live markets use curator-set parameters, oracle prices and accrued interest,
          computed in fixed-point with debt rounded up and collateral rounded down.
        </p>
      </div>

      <div className="p-6 md:p-8 grid gap-6 content-between" aria-live="polite">
        <div className="font-display text-[22px] md:text-[26px] leading-snug text-ink-2">
          HF = <span className="text-ink">(</span>
          <span className="num text-ink">{fmtUsd(c)}</span> × <span className="num text-ink">{Math.round(lt * 100)}%</span>
          <span className="text-ink">)</span> ÷ <span className="num text-ink">{fmtUsd(d)}</span>
        </div>

        <div className="flex items-end justify-between gap-4">
          <div>
            <div className="eyebrow mb-2">Health Factor</div>
            <div className="num font-display text-7xl md:text-8xl leading-none text-ink">{fmtHf(hf)}</div>
          </div>
          <div className={`flex items-center gap-2 font-mono text-xs ${color}`}>
            <span aria-hidden>{glyph}</span><span>{label}</span>
          </div>
        </div>

        <div>
          <div className="relative h-8">
            <div className="absolute inset-x-0 top-4 h-px bg-line-2" />
            {[0, 1, 2, 3].map((t) => (
              <div key={t} className="absolute top-2.5 h-3 w-px bg-line-2" style={{ left: `${(t / 3) * 100}%` }} />
            ))}
            <div className="absolute top-0 h-8 w-px bg-bad/70" style={{ left: `${100 / 3}%` }} />
            <div className="absolute top-[11px] size-[11px] -translate-x-1/2 rotate-45 bg-ink transition-[left] duration-300"
              style={{ left: `${pos * 100}%` }} />
          </div>
          <div className="flex justify-between font-mono text-[10px] text-mute num">
            <span>0</span><span className="text-bad/90 -ml-6">1.00 liquidation</span><span>2</span><span>3+</span>
          </div>
        </div>

        <p className="text-sm text-ink-2 leading-relaxed min-h-[3.5em] pretty">
          {hf < 1
            ? repay
              ? <>A liquidator could repay about <span className="num text-ink">{fmtUsd(repay)}</span> of debt at a 5% bonus to restore HF to 1.10 — the target-HF model in brief §6.10.</>
              : <>Restoring a 1.10 target isn&apos;t feasible in this simplified model; the contract would fall back to its close-factor rule.</>
            : <>Collateral would have to fall <span className="num text-ink">{Number.isFinite(hf) ? `${((1 - 1 / hf) * 100).toFixed(1)}%` : "—"}</span> before this position becomes liquidatable.</>}
        </p>
      </div>
    </div>
  );
}
