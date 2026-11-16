"use client";

import { useState } from "react";

export function CopyButton({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={() => navigator.clipboard.writeText(text).then(() => { setDone(true); setTimeout(() => setDone(false), 1500); })}
      className="shrink-0 border border-line px-3 py-1.5 font-mono text-[11px] uppercase text-ink hover:border-bronze hover:text-bronze"
    >
      {done ? "Copied ✓" : "Copy code"}
    </button>
  );
}
