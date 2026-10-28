"use client";

import { useState } from "react";
import { useWallet } from "@/components/wallet";
import { TARGET_CHAIN, isDeployed } from "@/lib/protocol";

const ACTIONS = ["Supply", "Borrow", "Repay", "Withdraw"] as const;
type Action = (typeof ACTIONS)[number];

// Brief §11.2 — the states every async action walks through.
const RAIL = ["Signature", "Transaction", "Confirmed", "Risk check", "Done"];

const NOTE: Record<Action, string> = {
  Supply: "Supplied assets earn the supply index. Rates are estimates and change with utilization.",
  Borrow: "Borrowing is blocked if your post-borrow Health Factor would fall below 1, or if the oracle is stale.",
  Repay: "Repay stays open even when the market is paused. Interest accrues between estimate and confirmation.",
  Withdraw: "You can only withdraw what the pool has available and what keeps your position solvent.",
};

export function ActionPanel() {
  const [a, setA] = useState<Action>("Supply");
  const [amt, setAmt] = useState("");
  const { w, connect, switchChain } = useWallet();
  const live = isDeployed();

  let cta: { label: string; onClick?: () => void; disabled: boolean; reason?: string };
  if (w.status !== "connected") cta = { label: "Connect wallet", onClick: connect, disabled: w.status === "no_provider", reason: w.status === "no_provider" ? "No browser wallet found." : undefined };
  else if (w.chainId !== TARGET_CHAIN.id) cta = { label: `Switch to ${TARGET_CHAIN.name}`, onClick: switchChain, disabled: false };
  else if (!live) cta = { label: `${a}`, disabled: true, reason: "No market is deployed on this network yet." };
  else if (!amt || Number(amt) <= 0) cta = { label: "Enter an amount", disabled: true };
  else cta = { label: `Review ${a.toLowerCase()}`, disabled: false };

  return (
    <div className="border border-line bg-s1">
      <div role="tablist" aria-label="Action" className="grid grid-cols-4 border-b border-line">
        {ACTIONS.map((x) => (
          <button key={x} role="tab" aria-selected={a === x} onClick={() => setA(x)}
            className={`h-11 text-sm relative ${a === x ? "text-ink" : "text-mute hover:text-ink-2"}`}>
            {x}
            {a === x && <span aria-hidden className="absolute inset-x-3 bottom-0 h-px bg-bronze" />}
          </button>
        ))}
      </div>

      <div className="p-5 grid gap-5">
        <label className="grid gap-2">
          <span className="flex justify-between text-xs text-mute"><span>Amount</span><span className="font-mono">Balance —</span></span>
          <div className="flex items-center border border-line-2 bg-bg focus-within:border-mute">
            <input inputMode="decimal" placeholder="0.00" value={amt}
              onChange={(e) => setAmt(e.target.value.replace(/[^0-9.]/g, ""))}
              className="num flex-1 bg-transparent h-14 px-4 text-2xl font-mono outline-none placeholder:text-line-2" />
            <span className="px-4 font-mono text-sm text-mute">—</span>
          </div>
        </label>

        <dl className="grid gap-2 text-sm">
          {[["Rate", "—"], ["Health Factor after", "—"], ["Network fee", "Shown by wallet"]].map(([k, v]) => (
            <div key={k} className="flex justify-between"><dt className="text-mute">{k}</dt><dd className="num font-mono text-ink-2">{v}</dd></div>
          ))}
        </dl>

        <div className="border border-warn/30 bg-warn/5 p-3 text-xs leading-relaxed text-ink-2">
          <span className="text-warn" aria-hidden>▲ </span>
          <strong className="font-medium text-ink">Public position.</strong> This amount, your address and the token transfer will be visible on {TARGET_CHAIN.name}.
        </div>

        <p className="text-xs text-mute leading-relaxed pretty">{NOTE[a]}</p>

        <button onClick={cta.onClick} disabled={cta.disabled}
          className="chamfer-sm h-12 bg-ink text-bg text-sm font-medium hover:bg-white disabled:bg-s3 disabled:text-mute disabled:cursor-not-allowed">
          {cta.label}
        </button>
        {cta.reason && <p className="text-xs text-mute -mt-2">{cta.reason}</p>}

        <ol className="grid grid-cols-5 gap-1 pt-2" aria-label="Transaction stages">
          {RAIL.map((s) => (
            <li key={s} className="grid gap-1.5">
              <span className="h-px bg-line-2" />
              <span className="font-mono text-[10px] text-mute">{s}</span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
