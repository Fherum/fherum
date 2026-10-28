"use client";

import { useState } from "react";
import { DEPLOYMENTS, explorerAddress } from "@/lib/deployments";
import { useNetwork } from "@/components/network-context";


export function ContractList() {
  const { net } = useNetwork();
  const [copied, setCopied] = useState<string | null>(null);
  const d = DEPLOYMENTS[net];

  const copy = (a: string) => {
    navigator.clipboard?.writeText(a).then(() => { setCopied(a); setTimeout(() => setCopied(null), 1200); }).catch(() => {});
  };

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        
        <p className="font-mono text-[11px] uppercase text-[#e9e4d8]/60">
          {d.label} · {d.contracts.length} contracts{d.explorer ? "" : " · no explorer"}
        </p>
      </div>

      {d.contracts.length === 0 ? (
        <div className="mt-6 border-2 border-dashed border-[#e9e4d8]/40 p-10">
          <p className="font-stencil uppercase text-5xl md:text-6xl leading-none">Not deployed.</p>
          <p className="mt-4 max-w-xl text-sm text-[#e9e4d8]/70 leading-relaxed">
            No FHERUM contracts exist on {d.label} ({d.chainId}) yet. Mainnet addresses will be published here only after deployment and audit — anything claiming to be FHERUM on mainnet today is not ours.
          </p>
        </div>
      ) : (
        <ul className="mt-6 border-t-2 border-[#e9e4d8]">
          {d.contracts.map((c) => {
            const href = explorerAddress(d, c.address);
            return (
              <li key={c.address} className="group grid md:grid-cols-[150px_1fr_auto] gap-x-6 gap-y-1 items-center py-4 px-2 -mx-2 border-b border-[#e9e4d8]/20 hover:bg-[#ff5a1f] hover:text-black transition-colors">
                <span className="font-mono text-[10px] uppercase text-[#ff5a1f] group-hover:text-black">{c.module}{c.mock ? " · mock" : ""}</span>
                <span>
                  <span className="font-stencil uppercase text-2xl leading-none">{c.name}</span>
                  <span className="block text-xs text-[#e9e4d8]/60 group-hover:text-black/70">{c.role}</span>
                </span>
                <span className="flex items-center gap-2 font-mono text-xs">
                  <span className="hidden lg:inline">{c.address}</span>
                  <span className="lg:hidden">{c.address.slice(0, 8)}…{c.address.slice(-6)}</span>
                  <button onClick={() => copy(c.address)} aria-label={`Copy ${c.name} address`}
                    className="h-8 px-2 border border-current uppercase text-[10px]">{copied === c.address ? "copied" : "copy"}</button>
                  {href && (
                    <a href={href} target="_blank" rel="noreferrer" aria-label={`Open ${c.name} in explorer`}
                      className="h-8 px-2 border border-current uppercase text-[10px] inline-flex items-center">explorer ↗</a>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      )}
      {d.contracts.some((c) => c.mock) && (
        <p className="mt-4 font-mono text-[11px] text-[#e9e4d8]/50 normal-case">Mock entries are testnet stand-ins: tokens and feeds have no value, and PlaintextFHEAdapter performs no encryption.</p>
      )}
    </div>
  );
}
