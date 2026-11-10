"use client";
import { useState } from "react";

// $FHERUM token on Robinhood Chain mainnet (verified on-chain: symbol "FHERUM").
export const TOKEN_CA = "0x8665f6e7ce1df1abe042d4b044e681be98a62974";

export function CaChip({ className = "" }: { className?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(TOKEN_CA);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  };
  return (
    <div className={`inline-flex items-stretch border border-line-2 font-mono text-[11px] uppercase ${className}`}>
      <span className="px-2 py-1 bg-bronze text-black">CA</span>
      <a href={`https://robinhoodchain.blockscout.com/token/${TOKEN_CA}`} target="_blank" rel="noopener noreferrer" className="px-2 py-1 normal-case text-ink-2 hover:text-bronze break-all">{TOKEN_CA}</a>
      <button type="button" onClick={copy} aria-label="Copy contract address" className="px-2 py-1 border-l border-line-2 text-ink hover:text-bronze">{copied ? "Copied" : "Copy"}</button>
    </div>
  );
}
