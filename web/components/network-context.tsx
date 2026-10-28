"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { DEPLOYMENTS, type NetworkKey } from "@/lib/deployments";
import { NetDropdown, type NetItem } from "@/components/net-dropdown";

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

/** Testnet/mainnet dropdown. Mainnet is selectable to inspect; it shows "not deployed" everywhere. */
export function NetToggle({ className = "" }: { className?: string }) {
  const { net, setNet } = useNetwork();
  const items: NetItem[] = (["testnet", "mainnet"] as const).map((k) => {
    const d = DEPLOYMENTS[k], live = d.contracts.length > 0;
    return { key: k, label: k, chainId: d.chainId, dot: live ? "ok" : "off", note: live ? undefined : "not deployed", hint: d.label };
  });
  return <NetDropdown items={items} value={net} onSelect={(k) => setNet(k as NetworkKey)} className={`text-[#e9e4d8] ${className}`} />;
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
