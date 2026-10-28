"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { CHAINS } from "@/lib/protocol";
import { useNet, useNetwork } from "@/components/network-context";
import { DEPLOYMENTS } from "@/lib/deployments";
import { NetDropdown, type NetItem } from "@/components/net-dropdown";

type Eip1193 = {
  request: (a: { method: string; params?: unknown[] }) => Promise<unknown>;
  on?: (e: string, f: (...a: unknown[]) => void) => void;
  removeListener?: (e: string, f: (...a: unknown[]) => void) => void;
};
declare global { interface Window { ethereum?: Eip1193 } }

export type WalletState =
  | { status: "no_provider" }
  | { status: "disconnected" }
  | { status: "awaiting_signature" }
  | { status: "connected"; address: string; chainId: number }
  | { status: "error"; message: string };

const Ctx = createContext<{ w: WalletState; connect: () => void; switchChain: (id?: number) => void; disconnect: () => void; switchErr: string | null } | null>(null);

export function WalletProvider({ children }: { children: ReactNode }) {
  const target = useNet().chain;
  const [w, setW] = useState<WalletState>({ status: "disconnected" });

  const read = useCallback(async () => {
    const eth = window.ethereum;
    if (!eth) return setW({ status: "no_provider" });
    const [accts, cid] = await Promise.all([
      eth.request({ method: "eth_accounts" }) as Promise<string[]>,
      eth.request({ method: "eth_chainId" }) as Promise<string>,
    ]);
    setW(accts[0] ? { status: "connected", address: accts[0], chainId: parseInt(cid, 16) } : { status: "disconnected" });
  }, []);

  useEffect(() => {
    // Reading the provider is a side effect on mount; state updates happen after the await.
    const eth = window.ethereum;
    const h = () => { read().catch(() => {}); };
    queueMicrotask(h);
    eth?.on?.("accountsChanged", h);
    eth?.on?.("chainChanged", h);
    return () => { eth?.removeListener?.("accountsChanged", h); eth?.removeListener?.("chainChanged", h); };
  }, [read]);

  const connect = useCallback(async () => {
    const eth = window.ethereum;
    if (!eth) return setW({ status: "no_provider" });
    setW({ status: "awaiting_signature" });
    try { await eth.request({ method: "eth_requestAccounts" }); await read(); }
    catch (e) { setW({ status: "error", message: (e as { code?: number }).code === 4001 ? "You rejected the request." : "Wallet request failed." }); }
  }, [read]);

  const [switchErr, setSwitchErr] = useState<string | null>(null);
  const switchChain = useCallback(async (id: number = target.id) => {
    const eth = window.ethereum; if (!eth) return;
    const chain = Object.values(CHAINS).find((c) => c.id === id) ?? target;
    const hex = `0x${chain.id.toString(16)}`;
    setSwitchErr(null);
    try { await eth.request({ method: "wallet_switchEthereumChain", params: [{ chainId: hex }] }); }
    catch (e) {
      const code = (e as { code?: number }).code;
      if (code === 4001) return setSwitchErr("You rejected the network switch.");
      // 4902 = unknown chain (MetaMask); other wallets wrap it (-32603 etc.) → try adding it.
      // Public RPC only — a keyed provider URL must never be handed to the wallet.
      try {
        await eth.request({ method: "wallet_addEthereumChain", params: [{
          chainId: hex, chainName: chain.name, rpcUrls: [chain.rpc],
          nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
        }] });
      } catch (e2) {
        setSwitchErr((e2 as { code?: number }).code === 4001 ? "You rejected adding the network." : `Couldn't switch. Add ${chain.name} (chain ${chain.id}, RPC ${chain.rpc}) in your wallet manually.`);
      }
    }
  }, [target]);

  const disconnect = useCallback(() => setW({ status: "disconnected" }), []);

  return <Ctx.Provider value={{ w, connect, switchChain, disconnect, switchErr }}>{children}</Ctx.Provider>;
}

export function useWallet() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useWallet outside WalletProvider");
  return c;
}

export const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

export function chainName(id: number) {
  return Object.values(CHAINS).find((c) => c.id === id)?.name ?? `Chain ${id}`;
}

export function WalletButton() {
  const { w, connect, switchChain, switchErr } = useWallet();
  const target = useNet().chain;
  if (w.status === "connected") {
    const wrong = w.chainId !== target.id;
    return wrong ? (
      <span className="relative inline-flex">
        <button onClick={() => switchChain()} title={`Wallet is on ${chainName(w.chainId)}`} className="h-9 px-3 border border-warn/60 text-warn text-sm font-mono inline-flex items-center gap-2 hover:bg-warn/10">
          <span aria-hidden className="text-[8px]">▲</span><span className="hidden sm:inline">Switch to {target.name}</span><span className="sm:hidden">Switch</span>
        </button>
        {switchErr && <span role="alert" className="absolute right-0 top-full mt-2 w-72 border border-bad/50 bg-s1 p-2 text-xs text-bad leading-snug">{switchErr}</span>}
      </span>
    ) : (
      <span className="h-9 px-3 border border-line-2 text-sm font-mono inline-flex items-center gap-2 text-ink">
        <span aria-hidden className="text-ok text-[8px]">●</span>{short(w.address)}
      </span>
    );
  }
  if (w.status === "no_provider")
    return <span className="h-9 px-3 border border-line text-sm text-mute inline-flex items-center">No wallet detected</span>;
  return (
    <button onClick={connect} disabled={w.status === "awaiting_signature"}
      className="chamfer-sm h-9 px-4 bg-ink text-bg hover:bg-white text-sm font-medium disabled:opacity-60">
      {w.status === "awaiting_signature" ? "Check your wallet…" : "Connect wallet"}
    </button>
  );
}

/** App network selector. Picking a network repoints the whole app (cookie → server re-render).
 *  Mainnet is selectable to inspect; it shows "not deployed" until contracts ship. */
export function NetworkSwitch() {
  const { w, switchChain } = useWallet();
  const { net, setNet } = useNetwork();
  const walletChain = w.status === "connected" ? w.chainId : null;
  const items: NetItem[] = (["testnet", "mainnet"] as const).map((k) => {
    const c = CHAINS[k], live = DEPLOYMENTS[k].contracts.length > 0;
    const needsSwitch = k === net && walletChain !== null && walletChain !== c.id;
    return {
      key: k, label: k === "testnet" ? "Testnet" : "Mainnet", chainId: c.id,
      dot: !live ? "off" : needsSwitch ? "warn" : "ok",
      note: !live ? "not deployed" : needsSwitch ? "switch wallet" : undefined,
      hint: `${c.name} · ${c.id}${live ? "" : " · not deployed yet"}`,
    };
  });
  return <NetDropdown items={items} value={net} className="text-ink"
    onSelect={(k) => {
      const n = k as keyof typeof CHAINS;
      setNet(n);
      if (DEPLOYMENTS[n].contracts.length && walletChain !== null && walletChain !== CHAINS[n].id) switchChain(CHAINS[n].id);
    }} />;
}
