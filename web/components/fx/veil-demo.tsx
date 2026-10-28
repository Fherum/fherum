"use client";

import { motion } from "motion/react";
import { useState } from "react";
import { Scramble } from "./scramble";

// Uses the brief's worked example only — labelled as an example, never as live data.
const ROWS = [
  ["Collateral", "$10,000", "0x9f3a…c41e"],
  ["Liquidation threshold", "80%", "80% (public)"],
  ["Debt", "$5,000", "0x07bd…e902"],
  ["Health Factor", "1.60", "ebool → solvent"],
];

export function VeilDemo() {
  const [view, setView] = useState<"you" | "observer">("observer");
  return (
    <div className="glass p-1">
      <div className="grid grid-cols-2 p-1 gap-1 relative">
        {(["observer", "you"] as const).map((v) => (
          <button key={v} onClick={() => setView(v)} className={`relative h-10 text-sm z-10 ${view === v ? "text-bg" : "text-ink-2"}`}>
            {view === v && <motion.span layoutId="veil-pill" className="absolute inset-0 bg-ink -z-10" transition={{ type: "spring", stiffness: 300, damping: 28 }} />}
            {v === "observer" ? "Observer sees (target)" : "You see"}
          </button>
        ))}
      </div>
      <ul className="p-4 grid gap-1">
        {ROWS.map(([k, plain, cipher]) => (
          <li key={k} className="flex justify-between items-center py-3 border-b border-line last:border-0">
            <span className="text-sm text-mute">{k}</span>
            <span className={`font-mono text-sm ${view === "observer" && plain !== cipher.split(" ")[0] ? "text-bronze" : "text-ink"}`}>
              <Scramble text={view === "you" ? plain : cipher} />
            </span>
          </li>
        ))}
      </ul>
      <p className="px-4 pb-4 font-mono text-[10px] text-mute">Example from the brief. Not live — positions are public until FHE support reaches this chain.</p>
    </div>
  );
}
