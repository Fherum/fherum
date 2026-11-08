"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { CHAINS, ENABLED_NETS } from "@/lib/protocol";
import { useNet, useNetwork } from "@/components/network-context";
import { DEPLOYMENTS } from "@/lib/deployments";
import { NetDropdown, type NetItem } from "@/components/net-dropdown";

type Eip1193 = {
  request: (a: { method: string; params?: unknown[] }) => Promise<unknown>;
  on?: (e: string, f: (...a: unknown[]) => void) => void;
  removeListener?: (e: string, f: (...a: unknown[]) => void) => void;
};
declare global { interface Window { ethereum?: Eip1193 } }

/** EIP-6963: each installed wallet announces itself, so users pick MetaMask / Rabby / … explicitly. */
export type WalletInfo = { uuid: string; name: string; icon: string; rdns: string };
type Announced = { info: WalletInfo; provider: Eip1193 };

let active: Eip1193 | null = null;
/** The provider the user chose. Every tx in the app must go through this, never a guessed window.ethereum. */
export function getProvider(): Eip1193 | null { return active; }

const PICK_KEY = "fherum.wallet.rdns";

export type WalletState =
  | { status: "no_provider" }
  | { status: "disconnected" }
  | { status: "awaiting_signature" }
  | { status: "connected"; address: string; chainId: number; wallet: string }
  | { status: "error"; message: string };

type CtxT = {
  w: WalletState; wallets: Announced[]; pickerOpen: boolean;
  connect: () => void; closePicker: () => void; choose: (a: Announced) => void;
  switchChain: (id?: number) => void; disconnect: () => void; switchErr: string | null;
};
const Ctx = createContext<CtxT | null>(null);

export function WalletProvider({ children }: { children: ReactNode }) {
  const target = useNet().chain;
  const [w, setW] = useState<WalletState>({ status: "disconnected" });
  const [wallets, setWallets] = useState<Announced[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [chosen, setChosen] = useState<Announced | null>(null);

  // Discover wallets (EIP-6963), with the legacy injected provider as a last-resort entry.
  useEffect(() => {
    const seen = new Map<string, Announced>();
    const onAnnounce = (e: Event) => {
      const d = (e as CustomEvent<Announced>).detail;
      if (!d?.info?.rdns || seen.has(d.info.rdns)) return;
      seen.set(d.info.rdns, d); setWallets([...seen.values()]);
    };
    window.addEventListener("eip6963:announceProvider", onAnnounce);
    window.dispatchEvent(new Event("eip6963:requestProvider"));
    const t = setTimeout(() => {
      if (!seen.size && window.ethereum) {
        seen.set("injected", { info: { uuid: "injected", name: "Browser wallet", icon: "", rdns: "injected" }, provider: window.ethereum });
        setWallets([...seen.values()]);
      }
      if (!seen.size) setW({ status: "no_provider" });
    }, 400);
    return () => { window.removeEventListener("eip6963:announceProvider", onAnnounce); clearTimeout(t); };
  }, []);

  const read = useCallback(async (a: Announced) => {
    const [accts, cid] = await Promise.all([
      a.provider.request({ method: "eth_accounts" }) as Promise<string[]>,
      a.provider.request({ method: "eth_chainId" }) as Promise<string>,
    ]);
    if (accts[0]) { active = a.provider; setW({ status: "connected", address: accts[0], chainId: parseInt(cid, 16), wallet: a.info.name }); }
    else { active = null; setW({ status: "disconnected" }); }
  }, []);

  // Silent reconnect only for the wallet this user explicitly chose before (and didn't disconnect).
  useEffect(() => {
    if (chosen || !wallets.length) return;
    const rdns = localStorage.getItem(PICK_KEY);
    const a = rdns ? wallets.find((x) => x.info.rdns === rdns) : undefined;
    if (a) queueMicrotask(() => { setChosen(a); read(a).catch(() => {}); });
  }, [wallets, chosen, read]);

  useEffect(() => {
    if (!chosen) return;
    const h = () => { read(chosen).catch(() => {}); };
    chosen.provider.on?.("accountsChanged", h);
    chosen.provider.on?.("chainChanged", h);
    return () => { chosen.provider.removeListener?.("accountsChanged", h); chosen.provider.removeListener?.("chainChanged", h); };
  }, [chosen, read]);

  const connect = useCallback(() => {
    if (!wallets.length) return setW({ status: "no_provider" });
    setPickerOpen(true);
  }, [wallets]);

  const choose = useCallback(async (a: Announced) => {
    setPickerOpen(false);
    setW({ status: "awaiting_signature" });
    try {
      // wallet_requestPermissions always opens the wallet's approval screen, even for a site it already trusts.
      try { await a.provider.request({ method: "wallet_requestPermissions", params: [{ eth_accounts: {} }] }); }
      catch (e) { if ((e as { code?: number }).code === 4001) throw e; await a.provider.request({ method: "eth_requestAccounts" }); }
      localStorage.setItem(PICK_KEY, a.info.rdns);
      setChosen(a);
      await read(a);
    } catch (e) {
      setW({ status: "error", message: (e as { code?: number }).code === 4001 ? "You rejected the request." : "Wallet request failed." });
    }
  }, [read]);

  const [switchErr, setSwitchErr] = useState<string | null>(null);
  const switchChain = useCallback(async (id: number = target.id) => {
    const eth = active; if (!eth) return;
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

  const disconnect = useCallback(() => {
    const p = active;
    localStorage.removeItem(PICK_KEY);
    active = null; setChosen(null); setW({ status: "disconnected" });
    // Best effort: MetaMask/Rabby support revoking, so the next connect asks again.
    p?.request({ method: "wallet_revokePermissions", params: [{ eth_accounts: {} }] }).catch(() => {});
  }, []);

  return (
    <Ctx.Provider value={{ w, wallets, pickerOpen, connect, closePicker: () => setPickerOpen(false), choose, switchChain, disconnect, switchErr }}>
      {children}
      <WalletPicker />
    </Ctx.Provider>
  );
}

/** Wallet chooser. Native <dialog> for Esc + focus trap; no window.confirm. */
function WalletPicker() {
  const { wallets, pickerOpen, closePicker, choose } = useWallet();
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current; if (!d) return;
    if (pickerOpen && !d.open) d.showModal();
    if (!pickerOpen && d.open) d.close();
  }, [pickerOpen]);
  return (
    <dialog ref={ref} onClose={closePicker} onClick={(e) => { if (e.target === ref.current) closePicker(); }}
      aria-labelledby="wallet-picker-title"
      className="m-auto w-[min(92vw,400px)] bg-s1 text-ink border border-line-2 p-0 backdrop:bg-black/70 backdrop:backdrop-blur-sm">
      <div className="p-6 grid gap-4">
        <div className="flex items-start justify-between gap-4">
          <div className="grid gap-1">
            <span className="font-mono text-[10px] uppercase text-mute">Connect</span>
            <h2 id="wallet-picker-title" className="text-xl font-medium">Choose a wallet</h2>
          </div>
          <button onClick={closePicker} aria-label="Close" className="h-8 w-8 shrink-0 border border-line-2 text-mute hover:text-ink">✕</button>
        </div>
        <ul className="grid gap-2">
          {wallets.map((a) => (
            <li key={a.info.rdns}>
              <button onClick={() => choose(a)}
                className="w-full flex items-center gap-3 border border-line-2 bg-bg px-4 py-3 text-left hover:border-bronze">
                {a.info.icon
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={a.info.icon} alt="" className="h-7 w-7" />
                  : <span aria-hidden className="grid place-items-center h-7 w-7 border border-line-2 font-mono text-xs">W</span>}
                <span className="text-sm font-medium">{a.info.name}</span>
                <span aria-hidden className="ml-auto text-bronze">→</span>
              </button>
            </li>
          ))}
        </ul>
        <p className="text-[11px] text-mute">Your wallet will ask you to approve the connection. FHERUM never sees your keys.</p>
      </div>
    </dialog>
  );
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
        <span aria-hidden className="text-ok text-[8px]">●</span><span className="hidden md:inline text-mute">{w.wallet}</span>{short(w.address)}
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
 *  Mainnet is listed only when NEXT_PUBLIC_MAINNET_* is configured (lib/protocol ENABLED_NETS). */
export function NetworkSwitch() {
  const { w, switchChain } = useWallet();
  const { net, setNet } = useNetwork();
  const walletChain = w.status === "connected" ? w.chainId : null;
  const items: NetItem[] = ENABLED_NETS.map((k) => {
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
