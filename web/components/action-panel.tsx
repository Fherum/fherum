"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  BaseError, ContractFunctionRevertedError, createPublicClient, createWalletClient, custom, defineChain,
  formatUnits, maxUint256, parseAbi, parseUnits, type Address, type EIP1193Provider,
} from "viem";
import { useWallet } from "@/components/wallet";
import { DEPLOYMENTS } from "@/lib/deployments";
import { useNet } from "@/components/network-context";
import type { NetInfo } from "@/lib/net";

/** Serializable market facts handed down from the server page (strings, not bigint). */
export type PanelMarket = {
  address: Address;
  loan: { address: Address; symbol: string; decimals: number };
  collateral: { address: Address; symbol: string; decimals: number };
  paused: boolean;
  borrowPaused: boolean;
  removeCollateralPaused: boolean;
  repayPaused: boolean;
};

type Action = "Supply" | "Withdraw" | "Collateral" | "Remove" | "Borrow" | "Repay";
const ACTIONS: { key: Action; label: string; asset: "loan" | "collateral" }[] = [
  { key: "Supply", label: "Supply", asset: "loan" },
  { key: "Withdraw", label: "Withdraw", asset: "loan" },
  { key: "Collateral", label: "Add collateral", asset: "collateral" },
  { key: "Remove", label: "Remove collateral", asset: "collateral" },
  { key: "Borrow", label: "Borrow", asset: "loan" },
  { key: "Repay", label: "Repay", asset: "loan" },
];
const NOTE: Record<Action, string> = {
  Supply: "Lend the loan asset to the pool. You earn the supply rate, which moves with utilization.",
  Withdraw: "Take back supplied assets, limited by what the pool has available right now.",
  Collateral: "Collateral backs your borrowing. It does not earn interest.",
  Remove: "Blocked if your Health Factor would fall below 1, while paused, or with a stale oracle.",
  Borrow: "Needs collateral first. Blocked above the market LTV, while paused, or with a stale oracle.",
  Repay: "Repay never pauses. Max repays the full debt including accrued interest.",
};
const FN = { Supply: "supply", Withdraw: "withdraw", Collateral: "addCollateral", Remove: "removeCollateral", Borrow: "borrow", Repay: "repay" } as const;

const marketAbi = parseAbi([
  "function supply(uint256 assets)", "function withdraw(uint256 assets)",
  "function addCollateral(uint256 assets)", "function removeCollateral(uint256 assets)",
  "function borrow(uint256 assets)", "function repay(address onBehalf, uint256 assets)",
  "function supplyShares(address) view returns (uint256)", "function supplyIndex() view returns (uint256)",
  "function collateralAssets(address) view returns (uint256)", "function debtAssets(address) view returns (uint256)",
  "function healthFactorWad(address) view returns (uint256)",
  "error AssetNotAllowed(address asset)", "error BorrowCapExceeded()", "error BorrowRounding()", "error CreditLineExceeded()",
  "error FeedNotEnabled(address asset)", "error FeeOnTransferNotSupported()", "error IncompleteRound(address asset)",
  "error InsufficientCash()", "error InsufficientLiquidity()", "error InvalidPrice(address asset)", "error InvalidTimestamp(address asset)",
  "error LtvExceeded()", "error MarketPaused()", "error NoDebt()", "error NotEligible()", "error PriceOutOfBounds(address asset)",
  "error RepayTooSmall()", "error ShareAccountingMismatch()", "error StalePrice(address asset)", "error SupplyCapExceeded()",
  "error Unhealthy()", "error WalletBorrowCapExceeded()", "error WalletSupplyCapExceeded()", "error WithdrawInsolvent()", "error ZeroAmount()",
  "error ERC20InsufficientBalance(address sender, uint256 balance, uint256 needed)",
  "error ERC20InsufficientAllowance(address spender, uint256 allowance, uint256 needed)",
]);
const erc20Abi = parseAbi([
  "function balanceOf(address) view returns (uint256)", "function allowance(address,address) view returns (uint256)",
  "function approve(address,uint256) returns (bool)", "function mint(address,uint256)",
]);

const HUMAN: Record<string, string> = {
  InsufficientLiquidity: "Not enough available: the pool lacks liquidity or the amount exceeds your position.",
  InsufficientCash: "The pool does not hold enough cash for this right now.",
  LtvExceeded: "That borrow is above the market LTV. Add collateral or borrow less.",
  Unhealthy: "That would push your Health Factor below 1.",
  WithdrawInsolvent: "That withdrawal would leave the pool insolvent.",
  MarketPaused: "This action is paused by the guardian.",
  StalePrice: "Oracle price is stale; risk actions are blocked until it updates.",
  NoDebt: "You have no debt to repay.",
  SupplyCapExceeded: "Market supply cap reached.", WalletSupplyCapExceeded: "Your wallet supply cap is reached.",
  BorrowCapExceeded: "Market borrow cap reached.", WalletBorrowCapExceeded: "Your wallet borrow cap is reached.",
  NotEligible: "This wallet is not on the market allowlist.", ZeroAmount: "Amount is too small.",
  RepayTooSmall: "Repay amount is too small.",
  ERC20InsufficientBalance: "Your wallet balance is too low. Use the testnet faucet below.",
  ERC20InsufficientAllowance: "Token approval is too low. Try again.",
};

function explain(e: unknown): string {
  if ((e as { code?: number })?.code === 4001) return "You rejected the request in your wallet.";
  if (e instanceof BaseError) {
    const r = e.walk((x) => x instanceof ContractFunctionRevertedError);
    if (r instanceof ContractFunctionRevertedError) {
      const name = r.data?.errorName ?? "";
      return HUMAN[name] ?? `Reverted: ${name || r.reason || "unknown reason"}`;
    }
    if (/User (rejected|denied)/i.test(e.message)) return "You rejected the request in your wallet.";
    return e.shortMessage;
  }
  return e instanceof Error ? e.message.split("\n")[0] : "Transaction failed.";
}

const toChain = (c: NetInfo["chain"]) => defineChain({
  id: c.id, name: c.name,
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [c.rpc] } },
});
// Browser reads and writes go through the user's wallet provider; the keyed server RPC never reaches the client.
const clients = (chain: ReturnType<typeof toChain>) => {
  const eth = window.ethereum as unknown as EIP1193Provider;
  return {
    pub: createPublicClient({ chain, transport: custom(eth) }),
    wal: createWalletClient({ chain, transport: custom(eth) }),
  };
};

type Pos = { loanBal: bigint; colBal: bigint; supplied: bigint; collateral: bigint; debt: bigint; hf: bigint };
type Stage = "idle" | "approve" | "sign" | "confirm" | "done" | "error";
const RAIL: [Stage, string][] = [["approve", "Approve"], ["sign", "Signature"], ["confirm", "Confirming"], ["done", "Done"]];
const ZERO = BigInt(0);

const fmt = (v: bigint, d: number, dp = 4) => {
  const [i, f = ""] = formatUnits(v, d).split(".");
  return `${BigInt(i).toLocaleString("en-US")}${dp ? "." + f.padEnd(dp, "0").slice(0, dp) : ""}`;
};
const hfText = (hf: bigint, debt: bigint) => (debt === ZERO ? "∞ (no debt)" : (Number(hf / BigInt(1e14)) / 1e4).toFixed(2));

export function ActionPanel({ market }: { market?: PanelMarket }) {
  const [a, setA] = useState<Action>("Supply");
  const [amount, setAmount] = useState("");
  const [pos, setPos] = useState<Pos | null>(null);
  const [stage, setStage] = useState<Stage>("idle");
  const [msg, setMsg] = useState<string | null>(null);
  const [tx, setTx] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<{ title: string; detail: string; hashes: string[] } | null>(null);
  const { w, connect, switchChain } = useWallet();
  const n = useNet();
  const TARGET_CHAIN = n.chain;
  const chain = toChain(n.chain);
  const live = n.live && !!market;
  const user = w.status === "connected" ? (w.address as Address) : null;
  const ready = !!user && w.status === "connected" && w.chainId === TARGET_CHAIN.id && live;
  const act = ACTIONS.find((x) => x.key === a)!;
  const tok = market ? market[act.asset] : null;

  const refresh = useCallback(async () => {
    if (!ready || !market || !user) return;
    const { pub } = clients(chain);
    const m = market.address;
    const [loanBal, colBal, shares, idx, collateral, debt, hf] = await Promise.all([
      pub.readContract({ address: market.loan.address, abi: erc20Abi, functionName: "balanceOf", args: [user] }),
      pub.readContract({ address: market.collateral.address, abi: erc20Abi, functionName: "balanceOf", args: [user] }),
      pub.readContract({ address: m, abi: marketAbi, functionName: "supplyShares", args: [user] }),
      pub.readContract({ address: m, abi: marketAbi, functionName: "supplyIndex" }),
      pub.readContract({ address: m, abi: marketAbi, functionName: "collateralAssets", args: [user] }),
      pub.readContract({ address: m, abi: marketAbi, functionName: "debtAssets", args: [user] }),
      pub.readContract({ address: m, abi: marketAbi, functionName: "healthFactorWad", args: [user] }),
    ]);
    // supplyIndex is a RAY (1e27); shares × index = underlying assets.
    setPos({ loanBal, colBal, supplied: (shares * idx) / BigInt(10) ** BigInt(27), collateral, debt, hf });
  }, [ready, market, user, n.chain.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    let off = false;
    queueMicrotask(() => { refresh().catch(() => { if (!off) setPos(null); }); });
    return () => { off = true; };
  }, [refresh]);

  const max: bigint | null = !pos ? null : ({
    Supply: pos.loanBal, Withdraw: pos.supplied, Collateral: pos.colBal, Remove: pos.collateral,
    Borrow: null, Repay: pos.debt < pos.loanBal ? pos.debt : pos.loanBal,
  } as Record<Action, bigint | null>)[a];

  const pausedReason = !market ? null
    : market.repayPaused && a === "Repay" ? "Repay is paused."
    : market.paused && a !== "Repay" ? "Market is paused. Repay stays open."
    : market.borrowPaused && a === "Borrow" ? "Borrowing is paused."
    : market.removeCollateralPaused && a === "Remove" ? "Collateral withdrawal is paused." : null;

  let parsed: bigint | null = null;
  try { parsed = tok && amount ? parseUnits(amount, tok.decimals) : null; } catch { parsed = null; }
  const busy = stage === "approve" || stage === "sign" || stage === "confirm";

  async function run() {
    if (!market || !user || !tok || !parsed) return;
    const { pub, wal } = clients(chain);
    setMsg(null); setTx(null);
    try {
      const fullRepay = a === "Repay" && !!pos && parsed >= pos.debt;
      const value = fullRepay ? maxUint256 : parsed;
      if (a === "Supply" || a === "Collateral" || a === "Repay") {
        // Full repay: approve debt plus 1% headroom for interest accrued before the tx lands.
        const need = fullRepay ? pos!.debt + pos!.debt / BigInt(100) + BigInt(1) : parsed;
        const allowance = await pub.readContract({ address: tok.address, abi: erc20Abi, functionName: "allowance", args: [user, market.address] });
        if (allowance < need) {
          setStage("approve");
          const h = await wal.writeContract({ account: user, chain, address: tok.address, abi: erc20Abi, functionName: "approve", args: [market.address, need] });
          setTx(h);
          await pub.waitForTransactionReceipt({ hash: h });
        }
      }
      setStage("sign");
      const args = (a === "Repay" ? [user, value] : [value]) as never;
      const { request } = await pub.simulateContract({ account: user, address: market.address, abi: marketAbi, functionName: FN[a], args });
      const hash = await wal.writeContract(request);
      setTx(hash); setStage("confirm");
      const r = await pub.waitForTransactionReceipt({ hash });
      if (r.status !== "success") throw new Error("Transaction reverted on chain.");
      setStage("done"); setAmount(""); setMsg(`${act.label} confirmed.`);
      setReceipt({ title: `${act.label} confirmed`, detail: `${amount} ${tok.symbol}`, hashes: [hash] });
      await refresh();
    } catch (e) { setStage("error"); setMsg(explain(e)); }
  }

  async function faucet() {
    if (!market || !user) return;
    const { pub, wal } = clients(chain);
    setMsg(null); setTx(null);
    try {
      const hashes: string[] = [];
      for (const [t, n] of [[market.collateral, "10"], [market.loan, "10000"]] as const) {
        setStage("sign");
        const h = await wal.writeContract({ account: user, chain, address: t.address, abi: erc20Abi, functionName: "mint", args: [user, parseUnits(n, t.decimals)] });
        setTx(h); setStage("confirm");
        await pub.waitForTransactionReceipt({ hash: h });
        hashes.push(h);
      }
      setStage("done"); setMsg(`Minted 10 ${market.collateral.symbol} and 10,000 ${market.loan.symbol} (testnet mocks, no value).`);
      setReceipt({ title: "Faucet confirmed", detail: `10 ${market.collateral.symbol} + 10,000 ${market.loan.symbol} · testnet mocks`, hashes });
      await refresh();
    } catch (e) { setStage("error"); setMsg(explain(e)); }
  }

  let cta: { label: string; onClick?: () => void; disabled: boolean; reason?: string };
  if (w.status !== "connected") cta = { label: "Connect wallet", onClick: connect, disabled: w.status === "no_provider", reason: w.status === "no_provider" ? "No browser wallet found. Install MetaMask or Rabby." : undefined };
  else if (w.chainId !== TARGET_CHAIN.id) cta = { label: `Switch to ${TARGET_CHAIN.name}`, onClick: () => switchChain(), disabled: false };
  else if (!live) cta = { label: act.label, disabled: true, reason: market ? "No market is deployed on this network yet." : "Open a market to act on it." };
  else if (pausedReason) cta = { label: act.label, disabled: true, reason: pausedReason };
  else if (!parsed || parsed <= ZERO) cta = { label: "Enter an amount", disabled: true };
  else if (max !== null && parsed > max && a !== "Repay") cta = { label: "Amount too high", disabled: true, reason: `Max ${fmt(max, tok!.decimals)} ${tok!.symbol}.` };
  else cta = { label: busy ? "Working…" : act.label, onClick: run, disabled: busy };

  const explorer = DEPLOYMENTS[n.net].explorer?.replace(/\/$/, "");
  const stageIdx = RAIL.findIndex(([s]) => s === stage);
  const P = (v: bigint, t: { decimals: number; symbol: string }, dp: number) => `${fmt(v, t.decimals, dp)} ${t.symbol}`;

  return (
    <div className="border border-line bg-s1 min-w-0">
      <div role="tablist" aria-label="Action" className="grid grid-cols-3 border-b border-line">
        {ACTIONS.map((x, i) => (
          <button key={x.key} role="tab" aria-selected={a === x.key} disabled={busy}
            onClick={() => { setA(x.key); setAmount(""); setStage("idle"); setMsg(null); setTx(null); }}
            className={`h-11 px-2 text-xs relative border-line ${i % 3 ? "border-l" : ""} ${i < 3 ? "border-b" : ""} ${a === x.key ? "text-ink bg-s2" : "text-mute hover:text-ink-2"}`}>
            {x.label}
            {a === x.key && <span aria-hidden className="absolute inset-x-3 bottom-0 h-px bg-bronze" />}
          </button>
        ))}
      </div>

      <div className="p-5 grid gap-5">
        <label className="grid gap-2">
          <span className="flex justify-between gap-3 text-xs text-mute">
            <span>Amount</span>
            <span className="font-mono truncate">
              {max !== null && tok
                ? <>Available {fmt(max, tok.decimals)} <button type="button" onClick={() => setAmount(formatUnits(max, tok.decimals))} className="ml-1 text-bronze hover:underline">Max</button></>
                : a === "Borrow" ? "Limited by LTV" : "Available —"}
            </span>
          </span>
          <div className="flex items-center border border-line-2 bg-bg focus-within:border-mute min-w-0">
            <input inputMode="decimal" placeholder="0.00" value={amount} disabled={busy} aria-label="Amount"
              onChange={(e) => { setAmount(e.target.value.replace(/[^0-9.]/g, "")); setStage("idle"); }}
              className="num flex-1 min-w-0 bg-transparent h-14 px-4 text-2xl font-mono outline-none placeholder:text-line-2" />
            <span className="px-4 font-mono text-sm text-mute shrink-0">{tok?.symbol ?? "—"}</span>
          </div>
        </label>

        <dl className="grid gap-2 text-sm">
          {([
            ["Wallet", pos && market ? `${P(pos.loanBal, market.loan, 2)} · ${P(pos.colBal, market.collateral, 2)}` : "—"],
            ["Supplied", pos && market ? P(pos.supplied, market.loan, 2) : "—"],
            ["Collateral", pos && market ? P(pos.collateral, market.collateral, 4) : "—"],
            ["Debt", pos && market ? P(pos.debt, market.loan, 2) : "—"],
            ["Health Factor", pos ? hfText(pos.hf, pos.debt) : "—"],
          ] as [string, string][]).map(([k, v]) => (
            <div key={k} className="flex justify-between gap-3 min-w-0"><dt className="text-mute shrink-0">{k}</dt><dd className={`num font-mono text-right truncate ${pos ? "text-ink" : "text-ink-2"}`}>{v}</dd></div>
          ))}
        </dl>

        <div className="border border-warn/30 bg-warn/5 p-3 text-xs leading-relaxed text-ink-2">
          <span className="text-warn" aria-hidden>▲ </span>
          <strong className="font-medium text-ink">Public position · simulated encryption.</strong> Amounts, your address and token transfers are visible on {TARGET_CHAIN.name}. This testnet uses a mock FHE adapter, not real encryption.
        </div>

        <p className="text-xs text-mute leading-relaxed pretty">{NOTE[a]}</p>

        <button onClick={cta.onClick} disabled={cta.disabled}
          className="chamfer-sm h-12 bg-ink text-bg text-sm font-medium hover:bg-white disabled:bg-s3 disabled:text-mute disabled:cursor-not-allowed">
          {cta.label}
        </button>
        {cta.reason && <p className="text-xs text-mute -mt-2">{cta.reason}</p>}

        {msg && (
          <p role="status" className={`text-xs leading-relaxed border p-3 break-words ${stage === "error" ? "border-bad/50 text-bad" : "border-ok/40 text-ok"}`}>
            {msg}
            {tx && explorer && <a href={`${explorer}/tx/${tx}`} target="_blank" rel="noreferrer" className="block mt-1 font-mono underline text-ink-2 hover:text-bronze">View transaction ↗</a>}
          </p>
        )}

        <ol className="grid grid-cols-4 gap-1 pt-1" aria-label="Transaction stages">
          {RAIL.map(([s, l], i) => {
            const on = stage !== "idle" && stage !== "error" && i <= stageIdx;
            return (
              <li key={s} className="grid gap-1.5">
                <span className={`h-px ${on ? "bg-bronze" : "bg-line-2"}`} />
                <span className={`font-mono text-[10px] ${on ? "text-ink" : "text-mute"}`}>{l}</span>
              </li>
            );
          })}
        </ol>

        {ready && market && (
          <div className="border-t border-line pt-4 grid gap-2">
            <p className="font-mono text-[10px] uppercase text-mute">Testnet faucet</p>
            <button type="button" onClick={faucet} disabled={busy}
              className="h-10 border border-line-2 text-ink font-mono uppercase text-xs hover:bg-ink hover:text-bg disabled:opacity-40">
              Get 10 {market.collateral.symbol} + 10,000 {market.loan.symbol}
            </button>
            <p className="text-[11px] text-mute">Mock tokens with no value. Two transactions; gas is paid in testnet ETH.</p>
          </div>
        )}
      </div>
      <TxModal data={receipt} explorer={explorer} chainName={TARGET_CHAIN.name} onClose={() => setReceipt(null)} />
    </div>
  );
}

/** Success popup: every confirmed tx hash links straight to the block explorer. Native <dialog> gives Esc + focus trap. */
function TxModal({ data, explorer, chainName, onClose }: {
  data: { title: string; detail: string; hashes: string[] } | null; explorer?: string; chainName: string; onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current; if (!d) return;
    if (data && !d.open) d.showModal();
    if (!data && d.open) d.close();
  }, [data]);
  return (
    <dialog ref={ref} onClose={onClose} onClick={(e) => { if (e.target === ref.current) onClose(); }}
      aria-labelledby="tx-modal-title"
      className="m-auto w-[min(92vw,440px)] bg-s1 text-ink border border-line-2 p-0 backdrop:bg-black/70 backdrop:backdrop-blur-sm">
      {data && (
        <div className="p-6 grid gap-5">
          <div className="flex items-start justify-between gap-4">
            <div className="grid gap-1.5">
              <span className="font-mono text-[10px] uppercase text-ok">● Transaction confirmed</span>
              <h2 id="tx-modal-title" className="text-xl font-medium">{data.title}</h2>
              <p className="font-mono text-xs text-mute">{data.detail} · {chainName}</p>
            </div>
            <button onClick={onClose} aria-label="Close" className="h-8 w-8 shrink-0 border border-line-2 text-mute hover:text-ink">✕</button>
          </div>
          <ul className="grid gap-2">
            {data.hashes.map((h, i) => (
              <li key={h}>
                {explorer ? (
                  <a href={`${explorer}/tx/${h}`} target="_blank" rel="noreferrer"
                    className="group flex items-center justify-between gap-3 border border-line-2 bg-bg px-4 py-3 hover:border-bronze">
                    <span className="grid gap-1 min-w-0">
                      <span className="font-mono text-[10px] uppercase text-mute">Tx hash{data.hashes.length > 1 ? ` ${i + 1}` : ""}</span>
                      <span className="font-mono text-sm truncate group-hover:text-bronze">{h.slice(0, 12)}…{h.slice(-10)}</span>
                    </span>
                    <span aria-hidden className="text-bronze shrink-0">↗</span>
                  </a>
                ) : (
                  <div className="border border-line-2 bg-bg px-4 py-3 font-mono text-xs break-all">{h}</div>
                )}
              </li>
            ))}
          </ul>
          <p className="text-[11px] text-mute">{explorer ? "Opens the block explorer in a new tab." : "No explorer configured for this network."}</p>
          <button onClick={onClose} className="chamfer-sm h-11 bg-ink text-bg text-sm font-medium hover:bg-white">Done</button>
        </div>
      )}
    </dialog>
  );
}
