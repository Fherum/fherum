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
  return (
    <div className="relative size-full min-h-[460px]">
      <div aria-hidden className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 aspect-square w-[78%] max-w-[560px] rounded-full bg-[#050404] border-2 border-[#e9e4d8] shadow-[12px_12px_0_#120c08]">
        <div className="absolute inset-3 rounded-full border border-dashed border-[#e9e4d8]/30 motion-safe:animate-[spin_40s_linear_infinite]" />
        <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-[#ff5a1f] text-black font-mono text-[10px] uppercase px-2">Specimen · FHE-01</span>
      </div>
      <div className="absolute inset-0" aria-label="Interactive 3D FHERUM coin. Drag to rotate, click the coin to flip, click orbiting tokens for details." role="img">
        <Scene reduced={reduced} onFlip={() => setEnc((v) => !v)} onPick={(i) => setPicked((p) => (p === i ? null : i))} picked={picked} />
      </div>

      <div className="pointer-events-none absolute left-1/2 -translate-x-1/2 bottom-6 bg-[#050404] border-2 border-[#e9e4d8] px-2 py-1 font-mono text-[10px] uppercase text-[#e9e4d8] flex gap-3 items-center">
        <span className="pulse-dot" aria-hidden /> drag · click coin · click tokens
      </div>

      <div className="pointer-events-none absolute right-2 top-0 w-60 glass p-3 font-mono text-[11px]">
        <div className="flex justify-between text-mute mb-1.5"><span>example position</span><span className={enc ? "text-bronze" : "text-warn"}>{enc ? "◆ encrypted" : "▲ plaintext"}</span></div>
        <div className="text-ink text-sm"><Scramble text={enc ? "0x9f3a…c41e" : "$10,000 · LT 80%"} /></div>
        <div className="text-ink-2"><Scramble text={enc ? "0x07bd…e902" : "debt $5,000 · HF 1.60"} /></div>
      </div>

      <AnimatePresence>
        {picked !== null && (
          <motion.div key={picked} initial={{ opacity: 0, y: 12, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 8 }}
            className="absolute right-0 bottom-4 w-72 glass p-4">
            <div className="font-mono text-[11px] text-bronze mb-1.5">{TOKEN_INFO[picked][0]}</div>
            <p className="text-xs text-ink-2 leading-relaxed">{TOKEN_INFO[picked][1]}</p>
            <button onClick={() => setPicked(null)} className="mt-2 font-mono text-[10px] text-mute hover:text-ink">close ×</button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
