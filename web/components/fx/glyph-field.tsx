"use client";

import { useEffect, useRef } from "react";

/** Ciphertext rain. Glyphs near the pointer "decrypt" into a brighter, readable digit. */
export function GlyphField({ color = "#ff5a1f", dim = "rgba(233,228,216,.10)", className = "" }: { color?: string; dim?: string; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current!, g = cv.getContext("2d")!;
    const S = 18, CH = "0123456789abcdef";
    let cols = 0, rows = 0, cells: number[] = [], drops: number[] = [], px = -999, py = -999, raf = 0;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const size = () => {
      const d = devicePixelRatio; cv.width = cv.clientWidth * d; cv.height = cv.clientHeight * d; g.setTransform(d, 0, 0, d, 0, 0);
      cols = Math.ceil(cv.clientWidth / S); rows = Math.ceil(cv.clientHeight / S);
      cells = Array.from({ length: cols * rows }, () => (Math.random() * 16) | 0);
      drops = Array.from({ length: cols }, () => Math.random() * rows);
    };
    const move = (e: PointerEvent) => { const r = cv.getBoundingClientRect(); px = e.clientX - r.left; py = e.clientY - r.top; };
    size(); addEventListener("resize", size); addEventListener("pointermove", move);
    let last = 0;
    const frame = (t: number) => {
      raf = requestAnimationFrame(frame);
      if (t - last < 60) return; last = t;
      g.clearRect(0, 0, cv.clientWidth, cv.clientHeight);
      g.font = "12px ui-monospace, monospace"; g.textAlign = "center"; g.textBaseline = "middle";
      for (let c = 0; c < cols; c++) {
        drops[c] += 0.35; if (drops[c] > rows + 8) drops[c] = -Math.random() * 20;
        for (let r = 0; r < rows; r++) {
          const i = r * cols + c; if (Math.random() < 0.02) cells[i] = (Math.random() * 16) | 0;
          const x = c * S + S / 2, y = r * S + S / 2;
          const dd = Math.hypot(x - px, y - py); const tail = drops[c] - r;
          if (dd < 110) { g.fillStyle = color; g.globalAlpha = 1 - dd / 110; g.fillText(CH[cells[i]], x, y); }
          else if (tail >= 0 && tail < 7) { g.fillStyle = color; g.globalAlpha = (1 - tail / 7) * 0.6; g.fillText(CH[cells[i]], x, y); }
          else { g.fillStyle = dim; g.globalAlpha = 1; g.fillText(CH[cells[i]], x, y); }
        }
      }
      g.globalAlpha = 1;
      if (reduce) cancelAnimationFrame(raf);
    };
    raf = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(raf); removeEventListener("resize", size); removeEventListener("pointermove", move); };
  }, [color, dim]);
  return <canvas ref={ref} aria-hidden className={`block size-full ${className}`} />;
}
