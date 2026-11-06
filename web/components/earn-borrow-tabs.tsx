"use client";

import { useSyncExternalStore, type ReactNode } from "react";

type View = "earn" | "borrow";
const TABS: { key: View; label: string; sub: string }[] = [
  { key: "earn", label: "Earn", sub: "Supply the loan asset, earn the variable supply rate" },
  { key: "borrow", label: "Borrow", sub: "Post collateral, borrow the loan asset" },
];

const subscribe = (cb: () => void) => { window.addEventListener("hashchange", cb); return () => window.removeEventListener("hashchange", cb); };
const readHash = (): View => (window.location.hash === "#borrow" ? "borrow" : "earn");

/** Earn / Borrow switch for /app/markets. Server-rendered content is passed in; state mirrors #earn / #borrow. */
export function EarnBorrowTabs({ earn, borrow, earnPanel, borrowPanel }: {
  earn: ReactNode; borrow: ReactNode; earnPanel: ReactNode; borrowPanel: ReactNode;
}) {
  const v = useSyncExternalStore(subscribe, readHash, () => "earn" as View);
  const pick = (k: View) => { history.replaceState(null, "", `#${k}`); window.dispatchEvent(new HashChangeEvent("hashchange")); };

  return (
    <div className="grid gap-4">
      <div role="tablist" aria-label="Market view" className="grid grid-cols-2 border border-line bg-s1 max-w-xl">
        {TABS.map((t, i) => (
          <button key={t.key} role="tab" aria-selected={v === t.key} onClick={() => pick(t.key)}
            className={`relative text-left px-5 py-3 ${i ? "border-l border-line" : ""} ${v === t.key ? "bg-s2 text-ink" : "text-mute hover:text-ink-2"}`}>
            <span className="font-stencil text-xl uppercase tracking-wide">{t.label}</span>
            <span className="block text-[11px] leading-snug mt-0.5">{t.sub}</span>
            {v === t.key && <span aria-hidden className="absolute inset-x-0 bottom-0 h-0.5 bg-bronze" />}
          </button>
        ))}
      </div>
      <div className="grid 2xl:grid-cols-[1fr_380px] gap-4 items-start">
        <div className="min-w-0">{v === "earn" ? earn : borrow}</div>
        <div className="2xl:sticky 2xl:top-20">{v === "earn" ? earnPanel : borrowPanel}</div>
      </div>
    </div>
  );
}
