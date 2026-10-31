"use client";

import { useEffect, useRef, useState } from "react";

export type NetItem = { key: string; label: string; chainId: number; dot: "ok" | "warn" | "off"; note?: string; disabled?: boolean; hint?: string };
const DOT = { ok: ["●", "text-[#3fb950]"], warn: ["▲", "text-warn"], off: ["○", "opacity-50"] } as const;

/** Compact network dropdown shared by the landing header and the app header. */
export function NetDropdown({ items, value, onSelect, className = "" }: { items: NetItem[]; value: string; onSelect: (k: string) => void; className?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const cur = items.find((i) => i.key === value) ?? items[0];
  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", down); document.addEventListener("keydown", key);
    return () => { document.removeEventListener("mousedown", down); document.removeEventListener("keydown", key); };
  }, [open]);
  if (items.length === 1) return (
    <div title={cur.hint} className={`font-mono text-[11px] uppercase h-9 px-3 inline-flex items-center gap-2 border border-current/30 ${className}`}>
      <span aria-hidden className={`text-[8px] ${DOT[cur.dot][1]}`}>{DOT[cur.dot][0]}</span>
      {cur.label}<span className="opacity-50">{cur.chainId}</span>
    </div>
  );
  return (
    <div ref={ref} className={`relative font-mono text-[11px] uppercase ${className}`}>
      <button type="button" aria-label="Network" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen((v) => !v)}
        title={cur.hint} className="h-9 px-3 inline-flex items-center gap-2 border border-current/30 hover:border-current/70 transition-colors">
        <span aria-hidden className={`text-[8px] ${DOT[cur.dot][1]}`}>{DOT[cur.dot][0]}</span>
        {cur.label}<span className="opacity-50">{cur.chainId}</span>
        <span aria-hidden className={`opacity-60 transition-transform ${open ? "rotate-180" : ""}`}>▾</span>
      </button>
      {open && (
        <ul role="listbox" aria-label="Network" className="absolute right-0 mt-1 min-w-[220px] z-50 border border-white/15 bg-[#0b0806] text-[#e9e4d8] shadow-xl py-1">
          {items.map((i) => (
            <li key={i.key}>
              <button type="button" role="option" aria-selected={i.key === value} disabled={i.disabled} title={i.hint}
                onClick={() => { onSelect(i.key); setOpen(false); }}
                className={`w-full h-10 px-3 flex items-center gap-2 text-left ${i.key === value ? "bg-white/[0.06]" : "hover:bg-white/[0.04]"} disabled:opacity-45 disabled:cursor-not-allowed`}>
                <span aria-hidden className={`text-[8px] ${DOT[i.dot][1]}`}>{DOT[i.dot][0]}</span>
                {i.label}<span className="opacity-50">{i.chainId}</span>
                {i.note && <span className="ml-auto opacity-50 normal-case">{i.note}</span>}
                {i.key === value && !i.note && <span aria-hidden className="ml-auto text-[#ff5a1f]">✓</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
