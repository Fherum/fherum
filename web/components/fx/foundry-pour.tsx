"use client";

import { useEffect, useRef, useState } from "react";

/* Halftone foundry pour (ladle → stream → mould → sparks), posterized in landing tokens. */
function useReduced() {
  const [r, setR] = useState(false);
  useEffect(() => {
    const q = matchMedia("(prefers-reduced-motion: reduce)");
    const f = () => setR(q.matches || document.documentElement.dataset.reduceMotion === "true");
    f(); q.addEventListener("change", f); return () => q.removeEventListener("change", f);
  }, []);
  return r;
}
const tok = (n: string, f: string) => (typeof window === "undefined" ? f : getComputedStyle(document.documentElement).getPropertyValue(n).trim() || f);
export function FoundryPour({ side }: { side: "l" | "r" }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const reduced = useReduced();
  useEffect(() => {
    const c = ref.current!; const g = c.getContext("2d")!;
    const src = document.createElement("canvas"); const sg = src.getContext("2d", { willReadFrequently: true })!;
    const C = { bg: tok("--bg", "#050404"), s2: tok("--s2", "#161210"), hot: tok("--warn", "#d9a441"), br: tok("--bronze", "#ff5a1f"), ink: tok("--ink", "#e9e4d8") };
    const flip = side === "r";
    let raf = 0, t = 0, mx = -1e3, my = -1e3;
    const sparks = Array.from({ length: 40 }, () => ({ x: 0, y: 0, vx: 0, vy: 0, life: 0 }));
    const fit = () => { const r = c.getBoundingClientRect(); c.width = r.width * devicePixelRatio; c.height = r.height * devicePixelRatio; };
    fit(); addEventListener("resize", fit);
    const mv = (e: PointerEvent) => { const r = c.getBoundingClientRect(); mx = e.clientX - r.left; my = e.clientY - r.top; };
    addEventListener("pointermove", mv);
    const draw = () => {
      const step = 8 * devicePixelRatio, cols = Math.ceil(c.width / step), rows = Math.ceil(c.height / step);
      src.width = cols; src.height = rows;
      // ── illustration in grid space (0..cols, 0..rows): ladle tilting, molten stream, mould, sparks
      sg.save(); if (flip) { sg.translate(cols, 0); sg.scale(-1, 1); }
      sg.fillStyle = "#000"; sg.fillRect(0, 0, cols, rows);
      const tilt = 0.55 + 0.12 * Math.sin(t * 0.5);
      const lx = cols * 0.4, ly = rows * 0.16, R = cols * 0.32;
      // ladle bowl (luminance 0.35) + molten rim (1.0)
      sg.save(); sg.translate(lx, ly); sg.rotate(tilt);
      sg.fillStyle = "rgb(130,130,130)"; sg.beginPath(); sg.arc(0, 0, R, 0, Math.PI); sg.closePath(); sg.fill();
      sg.fillStyle = "rgb(255,255,255)"; sg.fillRect(-R, -1.2, R * 2, 2.4);
      sg.fillStyle = "rgb(60,60,60)"; sg.fillRect(-R - cols * 0.6, -1, cols * 0.6, 2); // handle
      sg.restore();
      // stream from lip down to mould
      const lipX = lx + Math.cos(tilt) * R, lipY = ly + Math.sin(tilt) * R;
      const mouldY = rows * 0.86;
      for (let y = lipY; y < mouldY; y += 0.5) {
        const k = (y - lipY) / (mouldY - lipY);
        const x = lipX + 1.5 * k + 0.6 * Math.sin(y * 0.4 - t * 6);
        const w = 1.4 + k * 0.6 + 0.3 * Math.sin(y * 0.9 + t * 9);
        sg.fillStyle = `rgb(255,255,255)`; sg.fillRect(x - w / 2, y, w, 0.8);
      }
      // mould + pool glow
      const grd = sg.createRadialGradient(lipX + 1.5, mouldY, 0, lipX + 1.5, mouldY, cols * 0.7);
      grd.addColorStop(0, "rgb(230,230,230)"); grd.addColorStop(1, "rgb(0,0,0)");
      sg.fillStyle = grd; sg.fillRect(0, mouldY - cols * 0.5, cols, cols);
      sg.fillStyle = "rgb(70,70,70)"; sg.fillRect(cols * 0.05, mouldY + 1, cols * 0.9, rows - mouldY);
      sg.fillStyle = "rgb(255,255,255)"; sg.fillRect(cols * 0.12, mouldY, cols * 0.76, 1.2);
      // sparks
      if (!reduced) for (const sp of sparks) {
        if (sp.life <= 0) { sp.x = lipX + 1.5; sp.y = mouldY; sp.vx = (Math.random() - 0.5) * 1.6; sp.vy = -Math.random() * 1.8 - 0.4; sp.life = 30 + Math.random() * 40; }
        sp.x += sp.vx; sp.y += sp.vy; sp.vy += 0.05; sp.life--;
        sg.fillStyle = `rgb(${Math.min(255, sp.life * 6)},0,0)`; sg.fillRect(sp.x, sp.y, 1, 1);
      }
      sg.restore();
      const px = sg.getImageData(0, 0, cols, rows).data;
      // ── render as posterized halftone in landing palette
      g.fillStyle = C.bg; g.fillRect(0, 0, c.width, c.height);
      const hmx = mx * devicePixelRatio, hmy = my * devicePixelRatio;
      for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
        const o = (j * cols + i) * 4, x = i * step + step / 2, y = j * step + step / 2;
        const heat = Math.exp(-((x - hmx) ** 2 + (y - hmy) ** 2) / (2 * (70 * devicePixelRatio) ** 2));
        let k = Math.max(px[o] / 255, heat * 0.6) + (px[o] === 0 && px[o + 1] === 0 ? 0.06 : 0);
        k = Math.round(Math.min(1, k) * 4) / 4; if (k <= 0) continue;
        g.fillStyle = k >= 1 ? C.hot : k >= 0.75 ? C.br : k >= 0.5 ? C.br + "aa" : C.ink + "26";
        g.beginPath(); g.arc(x, y, (step / 2) * Math.sqrt(k), 0, 7); g.fill();
      }
      // reduced motion: keep a slow, low-fps ambient flow (no sparks) instead of freezing
      t += reduced ? 0.008 : 0.03;
      raf = reduced ? window.setTimeout(() => requestAnimationFrame(draw), 66) : requestAnimationFrame(draw);
    };
    draw();
    return () => { cancelAnimationFrame(raf); clearTimeout(raf); removeEventListener("resize", fit); removeEventListener("pointermove", mv); };
  }, [side, reduced]);
  return <canvas ref={ref} aria-hidden className="h-full w-full" />;
}
