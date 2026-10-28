"use client";

import { motion, useMotionTemplate, useMotionValue, useSpring } from "motion/react";
import { useState, type PointerEvent } from "react";
import { STACK, STATUS_LABEL } from "@/lib/protocol";

const HUES = ["#c08a5b", "#5fb38a", "#d9a441", "#9aa6c9", "#b9b6b0", "#e06a5a"];

/** Generative emblem per module: deterministic, no stock art. */
function Emblem({ i, hue }: { i: number; hue: string }) {
  const n = 3 + i;
  const pts = Array.from({ length: n }, (_, k) => {
    const a = (k / n) * Math.PI * 2 - Math.PI / 2;
    return `${50 + Math.cos(a) * 34},${50 + Math.sin(a) * 34}`;
  }).join(" ");
  return (
    <svg viewBox="0 0 100 100" className="size-28 drop-shadow-[0_8px_24px_rgba(0,0,0,.6)]" aria-hidden>
      <defs>
        <linearGradient id={`g${i}`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#f4efe8" /><stop offset=".5" stopColor={hue} /><stop offset="1" stopColor="#2a2a30" /></linearGradient>
      </defs>
      <circle cx="50" cy="50" r="44" fill="none" stroke={hue} strokeOpacity=".35" strokeDasharray="1 3" className="spin-slow" style={{ transformOrigin: "50px 50px" }} />
      <polygon points={pts} fill={`url(#g${i})`} stroke="#0a0a0b" strokeWidth="1.5" />
      <polygon points={pts} fill="none" stroke="#fff" strokeOpacity=".35" transform="translate(50 50) scale(.55) translate(-50 -50)" />
      <circle cx="50" cy="50" r="5" fill="#0a0a0b" stroke={hue} />
    </svg>
  );
}

function Card({ i }: { i: number }) {
  const m = STACK[i]; const hue = HUES[i % HUES.length];
  const mx = useMotionValue(0.5), my = useMotionValue(0.5);
  const rx = useSpring(useMotionValue(0), { stiffness: 200, damping: 18 });
  const ry = useSpring(useMotionValue(0), { stiffness: 200, damping: 18 });
  const [flip, setFlip] = useState(false);
  const sheen = useMotionTemplate`radial-gradient(420px circle at calc(${mx} * 100%) calc(${my} * 100%), rgba(255,255,255,.16), transparent 45%)`;
  const holo = useMotionTemplate`linear-gradient(115deg, transparent 20%, ${hue}33 calc(${mx} * 60%), #9aa6c933 calc(${mx} * 80%), transparent 85%)`;
  const move = (e: PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
    mx.set(x); my.set(y); ry.set((x - 0.5) * 22); rx.set((0.5 - y) * 22);
  };
  const leave = () => { rx.set(0); ry.set(0); };
  return (
    <div style={{ perspective: 1000 }} className="h-[400px]">
      <motion.div onPointerMove={move} onPointerLeave={leave} onClick={() => setFlip((f) => !f)}
        style={{ rotateX: rx, rotateY: ry, transformStyle: "preserve-3d" }} whileHover={{ scale: 1.03 }}
        className="relative size-full cursor-pointer select-none" role="button" aria-pressed={flip} tabIndex={0}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && setFlip((f) => !f)}
        aria-label={`${m.brand} card, ${flip ? "showing details" : "front"}. Press to flip.`}>
        <motion.div animate={{ rotateY: flip ? 180 : 0 }} transition={{ type: "spring", stiffness: 140, damping: 18 }}
          style={{ transformStyle: "preserve-3d" }} className="absolute inset-0">
          {/* FRONT */}
          <div className="nft-card absolute inset-0 p-5 flex flex-col" style={{ backfaceVisibility: "hidden", ["--hue" as string]: hue }}>
            <div className="flex justify-between font-mono text-[10px] text-mute"><span>#{String(i + 1).padStart(3, "0")}</span><span>V1 MODULE</span></div>
            <div className="flex-1 grid place-items-center" style={{ transform: "translateZ(40px)" }}><Emblem i={i} hue={hue} /></div>
            <div style={{ transform: "translateZ(24px)" }}>
              <div className="tracking-[0.2em] text-lg text-ink">{m.brand}</div>
              <div className="text-xs text-mute mt-1">{m.role}</div>
              <div className="mt-4 flex justify-between items-center font-mono text-[10px]">
                <span className="px-2 py-1 border border-line-2 text-ink-2">{m.status === "awaiting-vendor" ? "▲ " : "○ "}{STATUS_LABEL[m.status]}</span>
                <span className="text-mute">tap ↻</span>
              </div>
            </div>
            <motion.div className="pointer-events-none absolute inset-0 rounded-[inherit]" style={{ background: sheen }} />
            <motion.div className="pointer-events-none absolute inset-0 rounded-[inherit] mix-blend-screen" style={{ background: holo }} />
          </div>
          {/* BACK */}
          <div className="nft-card absolute inset-0 p-5 flex flex-col gap-4" style={{ backfaceVisibility: "hidden", transform: "rotateY(180deg)", ["--hue" as string]: hue }}>
            <div className="tracking-[0.2em] text-ink">{m.brand}</div>
            <p className="text-sm text-ink-2 leading-relaxed">{m.line}</p>
            <div className="mt-auto">
              <div className="eyebrow mb-1">Contracts</div>
              <p className="font-mono text-[11px] text-mute break-words">{m.contracts}</p>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </div>
  );
}

export function ModuleCards() {
  return (
    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
      {STACK.map((_, i) => (
        <motion.div key={i} initial={{ opacity: 0, y: 40, rotateX: 20 }} whileInView={{ opacity: 1, y: 0, rotateX: 0 }}
          viewport={{ once: true, margin: "-60px" }} transition={{ duration: 0.7, delay: (i % 3) * 0.1 }}>
          <Card i={i} />
        </motion.div>
      ))}
    </div>
  );
}
