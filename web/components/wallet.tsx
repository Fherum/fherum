"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { CHAINS, TARGET_CHAIN } from "@/lib/protocol";
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

const Ctx = createContext<{ w: WalletState; connect: () => void; switchChain: (id?: number) => void; disconnect: () => void } | null>(null);

export function WalletProvider({ children }: { children: ReactNode }) {
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

  const switchChain = useCallback(async (id: number = TARGET_CHAIN.id) => {
    const eth = window.ethereum; if (!eth) return;
    const chain = Object.values(CHAINS).find((c) => c.id === id) ?? TARGET_CHAIN;
    const hex = `0x${chain.id.toString(16)}`;
    try { await eth.request({ method: "wallet_switchEthereumChain", params: [{ chainId: hex }] }); }
    catch (e) {
      if ((e as { code?: number }).code === 4902) {
        // Public RPC only — a keyed provider URL must never be handed to the wallet.
        await eth.request({ method: "wallet_addEthereumChain", params: [{
          chainId: hex, chainName: chain.name, rpcUrls: [chain.rpc],
          nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
        }] }).catch(() => {});
      }
    }
  }, []);

  const disconnect = useCallback(() => setW({ status: "disconnected" }), []);

  return <Ctx.Provider value={{ w, connect, switchChain, disconnect }}>{children}</Ctx.Provider>;
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
  const { w, connect, switchChain } = useWallet();
  if (w.status === "connected") {
    const wrong = w.chainId !== TARGET_CHAIN.id;
    return wrong ? (
      <button onClick={() => switchChain()} className="h-9 px-3 border border-warn/60 text-warn text-sm font-mono inline-flex items-center gap-2">
        <span aria-hidden className="text-[8px]">▲</span>Wrong network — switch
      </button>
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

/** Network selector. Only chains with a FHERUM deployment are selectable; mainnet stays locked until it ships. */
const NETWORKS = [
  { key: "testnet", label: "Testnet", chain: CHAINS.testnet, live: true },
  { key: "mainnet", label: "Mainnet", chain: CHAINS.mainnet, live: false },
] as const;

export function NetworkSwitch() {
  const { w, switchChain } = useWallet();
  const walletChain = w.status === "connected" ? w.chainId : null;
  const items: NetItem[] = NETWORKS.map((n) => {
    const needsSwitch = n.chain.id === TARGET_CHAIN.id && walletChain !== null && walletChain !== n.chain.id;
    return {
      key: n.key, label: n.label, chainId: n.chain.id, disabled: !n.live,
      dot: !n.live ? "off" : needsSwitch ? "warn" : "ok",
      note: !n.live ? "soon" : needsSwitch ? "switch wallet" : undefined,
      hint: n.live ? `${n.chain.name} · ${n.chain.id}` : `${n.chain.name} · not deployed yet`,
    };
  });
  const sel = NETWORKS.find((n) => n.chain.id === TARGET_CHAIN.id)?.key ?? NETWORKS[0].key;
  return <NetDropdown items={items} value={sel} className="text-ink"
    onSelect={(k) => { const n = NETWORKS.find((x) => x.key === k); if (n?.live && walletChain !== null && walletChain !== n.chain.id) switchChain(n.chain.id); }} />;
}
