"use client";

import { motion, useScroll, useTransform } from "motion/react";
import { useRef } from "react";

const CARDS = [
  ["01", "Your loan is public.", "On a transparent chain anyone can read your collateral, your debt and exactly how close you are to liquidation."],
  ["02", "That is a target.", "Visible thresholds invite liquidation hunting and copy-trading. Treasuries and funds stay away."],
  ["03", "Privacy can't break solvency.", "Hiding positions is worthless if liquidations stop working. The market must stay auditable."],
  ["04", "So the design encrypts the position, not the market.", "Collateral and debt are designed to become ciphertext once FHE ships. Totals, rates, oracles and curator actions stay public."],
];

export function StackedCards() {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end end"] });
  return (
    <div ref={ref} className="relative" style={{ height: `${CARDS.length * 70 + 60}vh` }}>
      <div className="sticky top-0 h-dvh grid place-items-center overflow-hidden">
        <div className="relative w-[min(92vw,560px)] h-[380px]">
          {CARDS.map(([n, h, b], i) => {
            const s = i / CARDS.length, e = (i + 1) / CARDS.length;
            // eslint-disable-next-line react-hooks/rules-of-hooks
            const y = useTransform(scrollYProgress, [s - 0.25, s, e], [600, 0, i === CARDS.length - 1 ? 0 : -30]);
            // eslint-disable-next-line react-hooks/rules-of-hooks
            const rot = useTransform(scrollYProgress, [s - 0.25, s], [8, (i - 1.5) * 2.2]);
            // eslint-disable-next-line react-hooks/rules-of-hooks
            const op = useTransform(scrollYProgress, [s - 0.25, s - 0.15], [0, 1]);
            return (
              <motion.article key={n} style={{ y: i ? y : 0, rotate: rot, opacity: i ? op : 1, left: i * 26, top: i * 22 }}
                className="absolute w-[calc(100%-78px)] bg-[#e9e4d8] text-[#120c08] border-2 border-[#120c08] p-7 shadow-[10px_10px_0_#120c08]">
                <div className="flex justify-between font-mono text-xs"><span>{n} / 04</span><span aria-hidden>✕</span></div>
                <h3 className="font-stencil text-4xl leading-[0.95] uppercase mt-10">{h}</h3>
                <p className="mt-4 text-sm leading-relaxed text-[#3a2e24]">{b}</p>
              </motion.article>
            );
          })}
        </div>
      </div>
    </div>
  );
}
