"use client";

import { useEffect, useRef, useState } from "react";

const G = "0123456789abcdef◆▲■●$#%&";

/** Text that "decrypts" into place whenever it changes. */
export function Scramble({ text, ms = 600, className }: { text: string; ms?: number; className?: string }) {
  const [out, setOut] = useState(text);
  const raf = useRef(0);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) { raf.current = requestAnimationFrame(() => setOut(text)); return () => cancelAnimationFrame(raf.current); }
    const t0 = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / ms);
      const k = Math.floor(p * text.length);
      setOut(text.slice(0, k) + Array.from(text.slice(k), (c) => (c === " " ? " " : G[(Math.random() * G.length) | 0])).join(""));
      if (p < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [text, ms]);
  return <span className={`num ${className ?? ""}`}>{out}</span>;
}

/** Hover-to-decrypt: shows ciphertext until pointer/focus. */
export function HoverDecrypt({ plain, cipher }: { plain: string; cipher: string }) {
  const [on, setOn] = useState(false);
  return (
    <span tabIndex={0} onMouseEnter={() => setOn(true)} onMouseLeave={() => setOn(false)} onFocus={() => setOn(true)} onBlur={() => setOn(false)}
      className="cursor-crosshair outline-none">
      <Scramble text={on ? plain : cipher} ms={400} />
    </span>
  );
}
