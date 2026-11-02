"use client";
import { useEffect, useState } from "react";
import { PageHead } from "@/components/shell";
import { Panel } from "@/components/ui";
import { useWallet, short, chainName } from "@/components/wallet";
import { FHE_STATUS } from "@/lib/protocol";
import { useNet } from "@/components/network-context";

export default function Settings() {
  const { w, disconnect } = useWallet();
  const { chain: TARGET_CHAIN, live } = useNet();
  const [rm, setRm] = useState(false);
  useEffect(() => { document.documentElement.classList.toggle("reduce-motion", rm); }, [rm]);
  return (
    <>
      <PageHead eyebrow="Settings" title="Settings" />
      <div className="grid lg:grid-cols-2 gap-4 max-w-5xl">
        <Panel title="Wallet & network">
          <dl className="text-sm">
            {[["Wallet", w.status === "connected" ? short(w.address) : "Not connected"],
              ["Wallet network", w.status === "connected" ? chainName(w.chainId) : "—"],
              ["App network", `${TARGET_CHAIN.name} (${TARGET_CHAIN.id})${live ? "" : " · not deployed"}`],
              ["RPC", TARGET_CHAIN.rpc]].map(([k, v]) => (
              <div key={k} className="flex justify-between gap-4 px-5 py-3.5 border-b border-line"><dt className="text-mute">{k}</dt><dd className="font-mono text-xs text-ink-2 truncate">{v}</dd></div>
            ))}
          </dl>
          {w.status === "connected" && <button onClick={disconnect} className="m-5 h-9 px-3 border border-line-2 text-sm">Forget in this tab</button>}
        </Panel>
        <Panel title="Privacy">
          <div className="p-5 grid gap-3 text-sm">
            <p className="text-ink">Decrypt requests: none</p>
            <p className="text-mute text-xs leading-relaxed">{FHE_STATUS} If FHE privacy mode ships, every decryption you authorize would be listed here and revocable.</p>
          </div>
        </Panel>
        <Panel title="Display">
          <label className="flex items-center justify-between px-5 py-4 text-sm cursor-pointer">
            <span>Reduce motion<span className="block text-xs text-mute">Also follows your system setting.</span></span>
            <input type="checkbox" checked={rm} onChange={(e) => setRm(e.target.checked)} className="size-4 accent-[var(--bronze)]" />
          </label>
        </Panel>
      </div>
    </>
  );
}
