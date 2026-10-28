"use client";

import { useEffect, useRef, useState } from "react";

/* First-visit intro: the FHERUM stencil is "poured" full of molten metal while a
   position is encrypted to ciphertext, then the mould splits open onto the page.
   Shown once per browser session; click / any key skips; reduced motion = short fade. */
const KEY = "fherum.intro";
const HEX = "0123456789abcdef";
const STEPS = ["heating the mould", "encrypting position", "sealing ciphertext", "opening the foundry"];
const rhex = (n: number) => Array.from({ length: n }, () => HEX[(Math.random() * 16) | 0]).join("");

export function IntroLoader() {
  const [phase, setPhase] = useState<"pour" | "open" | "done">("pour");
  const [p, setP] = useState(0);
  const [cipher, setCipher] = useState("0x" + "0".repeat(40));
  const skip = useRef<() => void>(() => {});

  useEffect(() => {
    if (document.documentElement.dataset.intro === "seen") return; // hidden by CSS (pre-paint flag)
    try { sessionStorage.setItem(KEY, "1"); } catch {}
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches || document.documentElement.dataset.reduceMotion === "true";
    const DUR = reduced ? 500 : 2200;
    document.documentElement.style.overflow = "hidden";
    let raf = 0, t0 = 0, ended = false;
    const end = () => {
      if (ended) return; ended = true; cancelAnimationFrame(raf);
      setP(1); setPhase("open");
      setTimeout(() => { setPhase("done"); document.documentElement.style.overflow = ""; document.documentElement.dataset.intro = "seen"; }, reduced ? 250 : 900);
    };
    skip.current = end;
    const tick = (t: number) => {
      t0 ||= t;
      const k = Math.min(1, (t - t0) / DUR);
      const e = k < 0.5 ? 4 * k ** 3 : 1 - (-2 * k + 2) ** 3 / 2; // easeInOutCubic
      setP(e);
      // ciphertext locks in left→right as the pour rises
      const locked = Math.floor(e * 40);
      setCipher((c) => "0x" + c.slice(2, 2 + locked) + rhex(40 - locked));
      if (k < 1) raf = requestAnimationFrame(tick); else setTimeout(end, 250);
    };
    raf = requestAnimationFrame(tick);
    addEventListener("keydown", end, { once: true });
    return () => { cancelAnimationFrame(raf); removeEventListener("keydown", end); document.documentElement.style.overflow = ""; };
  }, []);

  if (phase === "done") return null;
  const pct = Math.round(p * 100);
  const open = phase === "open";
  const fill = `${(p * 100).toFixed(1)}%`;

  return (
    <div
      id="intro-loader"
      role="status"
      aria-label={`Loading FHERUM ${pct}%`}
      onClick={() => skip.current()}
      className="fixed inset-0 z-[100] cursor-pointer select-none"
    >
      {/* mould halves — slide apart on open */}
      {(["top", "bottom"] as const).map((h) => (
        <div
          key={h}
          className={`absolute inset-x-0 h-1/2 bg-bg transition-transform duration-[800ms] ease-[cubic-bezier(.7,0,.2,1)] ${h === "top" ? "top-0" : "bottom-0"}`}
          style={{ transform: open ? `translateY(${h === "top" ? "-100%" : "100%"})` : "none" }}
        />
      ))}
      {/* seam glow at the split line */}
      <div
        className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-warn transition-all duration-500"
        style={{ opacity: open ? 0 : p, boxShadow: `0 0 ${24 * p}px 2px var(--bronze)`, transform: `translateY(-50%) scaleX(${open ? 1.2 : p})` }}
      />

      <div className={`absolute inset-0 flex flex-col items-center justify-center px-6 transition-opacity duration-300 ${open ? "opacity-0" : "opacity-100"}`}>
        <div className="font-mono text-[11px] uppercase tracking-[0.2em] text-mute mb-6">
          You are now entering the foundry
        </div>

        {/* stencil wordmark filling with molten metal from the bottom */}
        <div
          className="font-stencil uppercase leading-[0.8] text-[clamp(72px,17vw,260px)] tracking-[-0.01em] text-transparent"
          style={{
            WebkitTextStroke: "1px var(--line-2, #3a322c)",
            backgroundImage: `linear-gradient(to top, var(--bronze) 0, var(--bronze) calc(${fill} - 6%), var(--warn) ${fill}, transparent calc(${fill} + 0.5%))`,
            WebkitBackgroundClip: "text",
            backgroundClip: "text",
            filter: `drop-shadow(0 0 ${18 * p}px color-mix(in srgb, var(--bronze) ${Math.round(p * 45)}%, transparent))`,
          }}
        >
          FHERUM
        </div>

        <div className="mt-8 w-full max-w-[min(640px,90vw)] font-mono text-[11px] uppercase">
          <div className="flex justify-between text-ink-2">
            <span>{STEPS[Math.min(STEPS.length - 1, Math.floor(p * STEPS.length))]}…</span>
            <span className="tabular-nums text-bronze">{String(pct).padStart(3, "0")}%</span>
          </div>
          <div className="mt-2 h-px bg-line"><div className="h-full bg-bronze" style={{ width: fill }} /></div>
          <div className="mt-3 normal-case truncate text-mute tabular-nums">
            <span className="text-ink-2">{cipher.slice(0, 2 + Math.floor(p * 40))}</span>
            {cipher.slice(2 + Math.floor(p * 40))}
          </div>
        </div>

        <div className="absolute bottom-6 font-mono text-[10px] uppercase tracking-[0.2em] text-mute">click or press any key to skip</div>
      </div>
    </div>
  );
}
