"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { DEPLOYMENTS, type NetworkKey } from "@/lib/deployments";

const KEY = "fherum.network";
const Ctx = createContext<{ net: NetworkKey; setNet: (n: NetworkKey) => void }>({ net: "testnet", setNet: () => {} });

export function NetworkProvider({ children }: { children: ReactNode }) {
  const [net, setNetState] = useState<NetworkKey>("testnet");
  useEffect(() => {
    const v = localStorage.getItem(KEY);
    if (v === "testnet" || v === "mainnet") queueMicrotask(() => setNetState(v));
  }, []);
  const setNet = (n: NetworkKey) => { setNetState(n); localStorage.setItem(KEY, n); };
  return <Ctx.Provider value={{ net, setNet }}>{children}</Ctx.Provider>;
}

export const useNetwork = () => useContext(Ctx);

/** Compact testnet/mainnet toggle. Mainnet is selectable to inspect; it shows "not deployed" everywhere. */
export function NetToggle({ className = "" }: { className?: string }) {
  const { net, setNet } = useNetwork();
  return (
    <div role="radiogroup" aria-label="Network" className={`inline-flex border border-[#e9e4d8]/40 font-mono text-[11px] uppercase ${className}`}>
      {(["testnet", "mainnet"] as const).map((k) => {
        const d = DEPLOYMENTS[k], on = k === net, live = d.contracts.length > 0;
        return (
          <button key={k} role="radio" aria-checked={on} onClick={() => setNet(k)}
            title={`${d.label} · ${d.chainId}${live ? "" : " · not deployed"}`}
            className={`h-9 px-3 inline-flex items-center gap-1.5 ${on ? "bg-[#e9e4d8] text-black" : "text-[#e9e4d8]/70 hover:text-[#e9e4d8]"}`}>
            <span aria-hidden className={`text-[8px] ${live ? "text-[#3fb950]" : "opacity-50"}`}>{live ? "●" : "○"}</span>{k}
          </button>
        );
      })}
    </div>
  );
}

/** One-line hero status that follows the selected network. */
export function NetStatus() {
  const { net } = useNetwork();
  const d = DEPLOYMENTS[net], live = d.contracts.length > 0;
  const rows = [["Chain", `${d.chainId} · ${net}`], ["Contracts", live ? "Deployed" : "Not deployed"], ["Privacy", "Public · FHE pending"], ["Audit", "None yet"]];
  return (
    <dl className="flex flex-wrap gap-x-8 gap-y-2 border-t border-[#e9e4d8]/20 pt-4 font-mono text-[11px] uppercase pointer-events-auto">
      {rows.map(([k, v]) => (<div key={k} className="flex gap-2"><dt className="text-[#e9e4d8]/45">{k}</dt><dd>{v}</dd></div>))}
    </dl>
  );
}
