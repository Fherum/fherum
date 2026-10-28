"use client";

import { motion, useScroll, useTransform } from "motion/react";
import { useRef, type ReactNode } from "react";

/** Oversized line that slides sideways with scroll. */
export function SlideLine({ children, dir = 1, className = "" }: { children: ReactNode; dir?: 1 | -1; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "end start"] });
  const x = useTransform(scrollYProgress, [0, 1], [`${dir * 12}%`, `${dir * -18}%`]);
  return <div ref={ref} className="overflow-hidden"><motion.div style={{ x }} className={`whitespace-nowrap ${className}`}>{children}</motion.div></div>;
}
