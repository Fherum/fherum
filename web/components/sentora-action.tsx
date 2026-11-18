"use client";

import { useEffect, useRef, useState } from "react";
import type { Address, EIP1193Provider } from "viem";
import { getProvider, useWallet } from "@/components/wallet";
import { deposit, position, withdrawAll, type Step } from "@/lib/sentora-vault";

type Pos = { shares: string; assets: string; wallet: string };
const fmt = (s: string) => Number(s).toLocaleString("en-US", { maximumFractionDigits: 4 });

/** Deposit / withdraw into a Sentora-curated Morpho vault on Ethereum. Experimental; user's wallet signs. */
export function SentoraAction({ vault, name, asset }: { vault: Address; name: string; asset: string }) {
  const { w, connect } = useWallet();
  const ref = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const [amt, setAmt] = useState("");
  const [pos, setPos] = useState<Pos | null>(null);
  const [steps, setSteps] = useState<Step[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<{ kind: string; steps: Step[] } | null>(null);
  const owner = w.status === "connected" ? (w.address as Address) : null;

  useEffect(() => {
    const d = ref.current; if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  useEffect(() => {
    if (!open || !owner) return;
    let live = true;
    position(vault, owner).then((p) => { if (live) setPos(p); }).catch(() => { if (live) setPos(null); });
    return () => { live = false; };
  }, [open, owner, vault, steps]);

  async function run(kind: "deposit" | "withdraw") {
    const eth = getProvider() as unknown as EIP1193Provider | null;
    if (!eth || !owner) return connect();
    setBusy(true); setErr(null); setSteps([]); setDone(null);
    let last: Step[] = [];
    const track = (s: Step[]) => { last = s; setSteps(s); };
    try {
      if (kind === "deposit") await deposit(vault, amt, owner, eth, track);
      else await withdrawAll(vault, owner, eth, track);
      setDone({ kind: kind === "deposit" ? `Deposited ${amt} ${asset}` : `Withdrew all ${asset}`, steps: last });
      setAmt("");
    } catch (e) {
      const m = (e as { shortMessage?: string; message?: string; code?: number });
      setErr(m.code === 4001 ? "You rejected the request." : (m.shortMessage ?? m.message ?? "Failed.").slice(0, 200));
    } finally { setBusy(false); }
  }

  const amtOk = Number(amt) > 0 && (!pos || Number(amt) <= Number(pos.wallet));

  return (
    <>
      <button onClick={() => (owner ? setOpen(true) : connect())} className="border border-line-2 px-3 py-1 text-xs font-mono hover:border-bronze hover:text-bronze">Deposit</button>
      <dialog ref={ref} onClose={() => { setOpen(false); setDone(null); }} onClick={(e) => { if (e.target === ref.current && !busy) setOpen(false); }}
        className="m-auto w-[min(92vw,440px)] bg-s1 text-ink border border-line-2 p-0 backdrop:bg-black/70 backdrop:backdrop-blur-sm">
        {done ? (
          <div className="grid gap-4">
            <div className="flex items-center justify-between border-b border-line px-5 py-3">
              <span className="font-mono text-[11px] uppercase tracking-widest text-mute">Sentora vault · Transaction</span>
              <span className="font-mono text-[11px] uppercase tracking-widest text-ok">● Confirmed</span>
            </div>
            <div className="grid gap-4 px-5 pb-5">
              <h3 className="font-display text-3xl uppercase text-ink">{done.kind}</h3>
              <p className="text-sm text-ink-2">Confirmed on Ethereum mainnet into {name}. Signed in your wallet.</p>
              {done.steps.map((s, i) => s.hash && (
                <div key={i} className="grid gap-1">
                  <span className="font-mono text-[10px] uppercase text-mute">{s.label}</span>
                  <a href={`https://etherscan.io/tx/${s.hash}`} target="_blank" rel="noreferrer" className="border border-line p-3 font-mono text-xs text-ink break-all hover:border-bronze">{s.hash} ↗</a>
                </div>
              ))}
              <div className="flex flex-wrap gap-3">
                <a className="inline-flex h-9 items-center px-3 bg-bronze text-black font-mono uppercase text-[11px]" href={`https://etherscan.io/address/${vault}`} target="_blank" rel="noreferrer">View vault on Etherscan ↗</a>
                <button className="inline-flex h-9 items-center px-3 border border-line-2 text-ink font-mono uppercase text-[11px]" onClick={() => { setDone(null); setSteps([]); }}>Back</button>
              </div>
            </div>
          </div>
        ) : (
        <div className="p-6 grid gap-4">
          <div className="flex items-start justify-between gap-4">
            <div className="grid gap-1">
              <span className="font-mono text-[10px] uppercase text-mute">Sentora vault · Ethereum · experimental</span>
              <h2 className="text-xl font-medium">{name}</h2>
            </div>
            <button disabled={busy} onClick={() => setOpen(false)} aria-label="Close" className="h-8 w-8 shrink-0 border border-line-2 text-mute hover:text-ink">✕</button>
          </div>
          <dl className="grid grid-cols-2 gap-2 text-sm">
            <dt className="text-mute">Wallet {asset}</dt><dd className="font-mono text-right">{pos ? fmt(pos.wallet) : "…"}</dd>
            <dt className="text-mute">In vault</dt><dd className="font-mono text-right">{pos ? `${fmt(pos.assets)} ${asset}` : "…"}</dd>
          </dl>
          <div className="flex gap-2">
            <input inputMode="decimal" placeholder={`Amount ${asset}`} value={amt} onChange={(e) => setAmt(e.target.value.replace(/[^0-9.]/g, ""))}
              className="flex-1 bg-bg border border-line-2 px-3 py-2 font-mono text-sm" />
            <button disabled={busy || !pos} onClick={() => pos && setAmt(pos.wallet)} className="border border-line-2 px-3 text-xs font-mono">MAX</button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button disabled={busy || !amtOk} onClick={() => run("deposit")} className="bg-bronze text-bg px-4 py-2 text-sm font-medium disabled:opacity-40">Approve & deposit</button>
            <button disabled={busy || !pos || Number(pos.shares) === 0} onClick={() => run("withdraw")} className="border border-line-2 px-4 py-2 text-sm disabled:opacity-40">Withdraw all</button>
          </div>
          {steps.length > 0 && (
            <ol className="grid gap-1 text-xs font-mono">
              {steps.map((s, i) => (
                <li key={i} className="flex justify-between gap-2">
                  <span>{i + 1}. {s.label} · {s.state === "done" ? "✓ confirmed" : s.state === "sent" ? "mining…" : "waiting for signature"}</span>
                  {s.hash && <a className="text-bronze" href={`https://etherscan.io/tx/${s.hash}`} target="_blank" rel="noreferrer">tx ↗</a>}
                </li>
              ))}
            </ol>
          )}
          {err && <p className="text-xs text-red-400 break-words">{err}</p>}
          <p className="text-[11px] text-mute">Runs on Ethereum mainnet and needs ETH for gas. Funds go straight into the Morpho vault curated by Sentora; FHERUM never holds them. Built with the public Sentora SDK. Not an endorsement or partnership.</p>
        </div>
        )}
      </dialog>
    </>
  );
}
