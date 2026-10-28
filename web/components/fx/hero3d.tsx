"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Scramble } from "./scramble";

const Scene = dynamic(() => import("./hero-scene"), { ssr: false, loading: () => <div className="size-full grid place-items-center font-mono text-xs text-mute">forging…</div> });

const TOKEN_INFO = [
  ["euint64 · collateral", "In confidential mode, your collateral amount is stored as an encrypted 64-bit integer handle."],
  ["euint64 · debt", "Debt is encrypted the same way. Interest indexes stay public so accounting is auditable."],
  ["ebool · solvent?", "IRONCLAD's target: compare collateral × LT ≥ debt on ciphertext and return only an encrypted yes/no."],
  ["0x… · handle", "On chain, observers see an opaque handle, not a number. Access control decides who may decrypt."],
  ["HF · ironclad", "Health Factor = collateral × LT ÷ debt. Below 1.00 the position becomes liquidatable."],
];

export function Hero3D() {
  const reduced = !!useReducedMotion();
  const [enc, setEnc] = useState(true);
  const [picked, setPicked] = useState<number | null>(null);
  const [touched, setTouched] = useState(false);
  return (
    <div className="relative size-full min-h-[460px]">
      <div aria-hidden className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 aspect-square w-[70%] max-w-[520px] rounded-full bg-[radial-gradient(circle,rgba(255,90,31,0.28),rgba(255,90,31,0.08)_45%,transparent_70%)] blur-2xl" />
      <div className="absolute inset-0" aria-label="Interactive 3D FHERUM coin. Drag to rotate, click the coin to flip, click orbiting tokens for details." role="img">
        <Scene reduced={reduced} onFlip={() => { setTouched(true); setEnc((v) => !v); }} onPick={(i) => { setTouched(true); setPicked((p) => (p === i ? null : i)); }} picked={picked} />
      </div>

      <div className="pointer-events-none absolute left-1/2 -translate-x-1/2 bottom-6 text-center font-mono text-[11px]">
        <div className="flex items-center justify-center gap-3 text-[#e9e4d8]/55 uppercase text-[10px]">
          <span>example position</span><span className={enc ? "text-[#ff5a1f]" : "text-warn"}>{enc ? "◆ encrypted" : "▲ plaintext"}</span>
        </div>
        <div className="mt-1 text-[#e9e4d8]"><Scramble text={enc ? "0x9f3a…c41e · 0x07bd…e902" : "$10,000 · LT 80% · debt $5,000 · HF 1.60"} /></div>
        {!touched && <div className="mt-2 text-[10px] uppercase text-[#e9e4d8]/40">drag · click coin · click tokens</div>}
      </div>

      <AnimatePresence>
        {picked !== null && (
          <motion.div key={picked} initial={{ opacity: 0, y: 12, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 8 }}
            className="absolute right-0 top-4 w-72 glass p-4">
            <div className="font-mono text-[11px] text-bronze mb-1.5">{TOKEN_INFO[picked][0]}</div>
            <p className="text-xs text-ink-2 leading-relaxed">{TOKEN_INFO[picked][1]}</p>
            <button onClick={() => setPicked(null)} className="mt-2 font-mono text-[10px] text-mute hover:text-ink">close ×</button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
