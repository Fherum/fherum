"use client";

import { motion } from "motion/react";
import { useState } from "react";
import { STACK, STATUS_LABEL } from "@/lib/protocol";

const GLYPH = ["◐", "◆", "⬢", "◎", "⊓", "✕"];

/** Stamped iron dog-tags. Hover to lift, click to stamp-flip. */
function Tag({ i }: { i: number }) {
  const m = STACK[i]; const [open, setOpen] = useState(false);
  return (
    <motion.button onClick={() => setOpen((o) => !o)} aria-expanded={open}
      initial={{ y: 80, rotate: (i % 2 ? 1 : -1) * 6, opacity: 0 }} whileInView={{ y: 0, rotate: (i % 2 ? 1 : -1) * 1.5, opacity: 1 }}
      viewport={{ once: true }} transition={{ type: "spring", stiffness: 120, damping: 14, delay: (i % 3) * 0.08 }}
      whileHover={{ y: -12, rotate: 0, transition: { type: "spring", stiffness: 300 } }} whileTap={{ scale: 0.97 }}
      className="group relative text-left bg-[#e9e4d8] text-[#120c08] border-2 border-[#120c08] shadow-[8px_8px_0_#120c08] hover:shadow-[14px_14px_0_#ff5a1f] transition-shadow">
      <div className="flex items-center justify-between border-b-2 border-[#120c08] px-4 h-10 font-mono text-[11px]">
        <span>MOD-{String(i + 1).padStart(2, "0")}</span>
        <span className="size-3 rounded-full border-2 border-[#120c08] group-hover:bg-[#ff5a1f]" aria-hidden />
      </div>
      <div className="p-5 min-h-[260px] flex flex-col">
        <div className="flex items-start justify-between">
          <span className="font-stencil text-[44px] leading-none uppercase tracking-tight">{m.brand}</span>
          <motion.span animate={{ rotate: open ? 180 : 0 }} className="text-4xl leading-none" aria-hidden>{GLYPH[i]}</motion.span>
        </div>
        <div className="font-mono text-xs mt-2 uppercase text-[#6b5a4a]">{m.role}</div>
        <motion.div initial={false} animate={{ height: open ? "auto" : 0, opacity: open ? 1 : 0 }} className="overflow-hidden">
          <p className="text-sm leading-relaxed mt-4">{m.line}</p>
          <p className="font-mono text-[11px] mt-3 text-[#6b5a4a] break-words">{m.contracts}</p>
        </motion.div>
        <div className="mt-auto pt-6 flex items-center justify-between font-mono text-[11px]">
          <span className={`px-2 py-1 ${m.status === "awaiting-vendor" ? "bg-[#ff5a1f] text-[#120c08]" : "bg-[#120c08] text-[#e9e4d8]"}`}>
            {m.status === "awaiting-vendor" ? "▲ " : "○ "}{STATUS_LABEL[m.status]}
          </span>
          <span>{open ? "− close" : "+ open"}</span>
        </div>
      </div>
    </motion.button>
  );
}

export function IronTags() {
  return <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-8">{STACK.map((_, i) => <Tag key={i} i={i} />)}</div>;
}
