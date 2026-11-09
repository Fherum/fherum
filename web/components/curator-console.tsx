"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { formatUnits, keccak256, parseAbi, parseUnits, toHex, type Address } from "viem";
import { useWallet, short } from "@/components/wallet";
import { useNet } from "@/components/network-context";
import { Empty, Panel, Tag, Th } from "@/components/ui";
import { TxModal, explain, toChain, type TxReceiptData } from "@/components/action-panel";
import { createPublicClient, createWalletClient, custom, type EIP1193Provider } from "viem";
import { getProvider } from "@/components/wallet";
import { curatorConfirmed } from "@/app/actions";

/** Serializable, server-read market facts (all from chain). */
export type CuratedMarket = {
  address: Address;
  label: string;
  loan: { symbol: string; decimals: number };
  caps: { supply: string; borrow: string; walletSupply: string; walletBorrow: string };
  totals: { supply: string; debt: string };
  utilWad: string;
  ltvWad: string;
  ltWad: string;
  targetHfWad: string | null;
  paused: { any: boolean; borrow: boolean; removeCollateral: boolean; liquidation: boolean };
};
export type QueueRow = {
  id: `0x${string}`; market: Address; label: string; eta: number; queuedTx: `0x${string}`;
  state: "waiting" | "ready" | "done" | "cancelled";
};
export type LogRow = { kind: "Queued" | "Executed" | "Cancelled"; id: `0x${string}`; label?: string; market?: Address; tx: `0x${string}`; block: string };

const regAbi = parseAbi([
  "function hasRole(bytes32,address) view returns (bool)",
  "function queueCaps(address,uint256,uint256,uint256,uint256) returns (bytes32)",
  "function queueTargetHealthFactor(address,uint256) returns (bytes32)",
  "function execute(bytes32)",
  "function cancel(bytes32)",
]);
const CURATOR_ROLE = keccak256(toHex("CURATOR_ROLE"));
const ADMIN_ROLE = ("0x" + "0".repeat(64)) as `0x${string}`;
const WAD = 1e18;
const pctW = (w: string | bigint, dp = 1) => `${(Number(BigInt(w)) / WAD * 100).toFixed(dp)}%`;
const tok = (v: string, d: number) => Number(formatUnits(BigInt(v), d)).toLocaleString("en-US", { maximumFractionDigits: 4 });
const usedPct = (used: string, cap: string) => (BigInt(cap) === BigInt(0) ? null : Number((BigInt(used) * BigInt(10000)) / BigInt(cap)) / 100);
const left = (eta: number, now: number) => {
  const s = Math.max(0, eta - now);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return `${h}h ${String(m).padStart(2, "0")}m ${String(sec).padStart(2, "0")}s`;
};

function useNow() {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => { const t = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000); return () => clearInterval(t); }, []);
  return now;
}

export function CuratorConsole({ registry, minDelay, markets, queue, log, explorer, scannedTo }: {
  registry: Address; minDelay: number; markets: CuratedMarket[]; queue: QueueRow[]; log: LogRow[]; explorer?: string; scannedTo: string;
}) {
  const { w, connect, switchChain } = useWallet();
  const n = useNet();
  const router = useRouter();
  const now = useNow();
  const user = w.status === "connected" ? (w.address as Address) : null;
  const onChain = w.status === "connected" && w.chainId === n.chain.id;
  const [roleRead, setRole] = useState<{ who: string; curator: boolean; admin: boolean } | null>(null);
  const role = user && onChain && roleRead?.who === user ? roleRead : null;
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<TxReceiptData | null>(null);
  const chain = toChain(n.chain);

  useEffect(() => {
    const eth = getProvider() as unknown as EIP1193Provider | null;
    if (!user || !onChain || !eth) return;
    const pub = createPublicClient({ chain, transport: custom(eth) });
    Promise.all([
      pub.readContract({ address: registry, abi: regAbi, functionName: "hasRole", args: [CURATOR_ROLE, user] }),
      pub.readContract({ address: registry, abi: regAbi, functionName: "hasRole", args: [ADMIN_ROLE, user] }),
    ]).then(([c, a]) => setRole({ who: user, curator: c as boolean, admin: a as boolean })).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, onChain, registry]);

  const send = useCallback(async (key: string, title: string, detail: string, fn: "queueCaps" | "queueTargetHealthFactor" | "execute" | "cancel", args: readonly unknown[]) => {
    const eth = getProvider() as unknown as EIP1193Provider | null;
    if (!user || !eth) return;
    setBusy(key); setMsg(null);
    try {
      const pub = createPublicClient({ chain, transport: custom(eth) });
      const wal = createWalletClient({ chain, transport: custom(eth) });
      const { request } = await pub.simulateContract({ account: user, address: registry, abi: regAbi, functionName: fn, args } as never);
      const hash = await wal.writeContract(request as never);
      const r = await pub.waitForTransactionReceipt({ hash });
      if (r.status !== "success") throw new Error("Transaction reverted on chain.");
      setReceipt({ title, detail, txs: [{ label: title, hash, block: r.blockNumber }] });
      await curatorConfirmed(n.net);
      router.refresh();
    } catch (e) {
      setMsg(explain(e, "The registry rejected this. Only the curator can queue or cancel; execute opens after the timelock delay."));
    } finally { setBusy(null); }
  }, [user, chain, registry, n.net, router]);

  const canCurate = !!role?.curator;
  const canCancel = !!role?.curator || !!role?.admin;
  const open = queue.filter((q) => q.state === "waiting" || q.state === "ready");
  const delayH = Math.round(minDelay / 3600);

  return (
    <div className="grid gap-4">
      <Panel title="Your role" aside={<span className="font-mono text-[10px] text-mute">Registry {short(registry)}</span>}>
        <div className="px-5 py-4 flex flex-wrap items-center gap-3 text-sm">
          {!user ? (
            <><span className="text-mute">Connect a wallet to see whether it holds the curator role.</span><button onClick={() => connect()} className="text-bronze hover:underline underline-offset-4">Connect →</button></>
          ) : !onChain ? (
            <><span className="text-mute">Wallet is on another network.</span><button onClick={() => switchChain()} className="text-bronze hover:underline underline-offset-4">Switch to {n.chain.name} →</button></>
          ) : role === null ? (
            <span className="text-mute">Reading roles from chain…</span>
          ) : (
            <>
              <span className="font-mono text-xs">{short(user)}</span>
              {role.curator && <Tag tone="ok">Curator</Tag>}
              {role.admin && <Tag tone="ok">Registry admin</Tag>}
              {!role.curator && !role.admin && <Tag tone="mute">No curator role · read-only</Tag>}
              <span className="text-mute text-xs">Anyone may execute a change once its {delayH}h timelock has passed.</span>
            </>
          )}
        </div>
      </Panel>

      <Panel title="Markets under curation · risk monitor">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead className="border-b border-line"><tr><Th>Market</Th><Th right>Utilization</Th><Th right>Supply cap used</Th><Th right>Borrow cap used</Th><Th right>LTV / Liq.</Th><Th right>Target HF</Th><Th>Status</Th></tr></thead>
            <tbody>
              {markets.map((m) => {
                const su = usedPct(m.totals.supply, m.caps.supply), bu = usedPct(m.totals.debt, m.caps.borrow);
                const util = Number(BigInt(m.utilWad)) / WAD;
                const flags = [m.paused.any && "Paused", m.paused.borrow && "Borrow paused", m.paused.removeCollateral && "Withdraw collateral paused", m.paused.liquidation && "Liquidation paused"].filter(Boolean) as string[];
                return (
                  <tr key={m.address} className="border-b border-line last:border-0">
                    <td className="px-4 py-3"><a href={`/app/markets/${m.address}`} className="hover:text-bronze">{m.label}</a><div className="font-mono text-[10px] text-mute">{short(m.address)}</div></td>
                    <td className={`px-4 py-3 text-right font-mono ${util > 0.9 ? "text-bad" : util > 0.8 ? "text-warn" : ""}`}>{pctW(m.utilWad)}</td>
                    <td className={`px-4 py-3 text-right font-mono ${su !== null && su > 90 ? "text-warn" : ""}`}>{su === null ? "no cap" : `${su.toFixed(1)}%`}<div className="text-[10px] text-mute">{tok(m.totals.supply, m.loan.decimals)} / {tok(m.caps.supply, m.loan.decimals)} {m.loan.symbol}</div></td>
                    <td className={`px-4 py-3 text-right font-mono ${bu !== null && bu > 90 ? "text-warn" : ""}`}>{bu === null ? "no cap" : `${bu.toFixed(1)}%`}<div className="text-[10px] text-mute">{tok(m.totals.debt, m.loan.decimals)} / {tok(m.caps.borrow, m.loan.decimals)} {m.loan.symbol}</div></td>
                    <td className="px-4 py-3 text-right font-mono">{pctW(m.ltvWad, 0)} / {pctW(m.ltWad, 0)}</td>
                    <td className="px-4 py-3 text-right font-mono">{m.targetHfWad ? (Number(BigInt(m.targetHfWad)) / WAD).toFixed(2) : "—"}</td>
                    <td className="px-4 py-3">{flags.length ? <Tag tone="bad">{flags.join(" · ")}</Tag> : <Tag tone="ok">Active</Tag>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="px-4 py-2 border-t border-line font-mono text-[10px] text-mute">Read from chain on every page load. Amber above 80% utilization or 90% of a cap, red above 90% utilization.</p>
      </Panel>

      <div className="grid lg:grid-cols-2 gap-4 items-start">
        <QueueForm markets={markets} enabled={canCurate && onChain} busy={busy} delayH={delayH}
          onCaps={(m, v) => send("q", "Caps change queued", `${m.label} · executes after ${delayH}h`, "queueCaps", [m.address, ...v])}
          onHf={(m, v) => send("q", "Target HF change queued", `${m.label} · executes after ${delayH}h`, "queueTargetHealthFactor", [m.address, v])} />

        <Panel title={`Timelock queue · ${delayH}h delay`}>
          {open.length === 0 ? (
            <Empty title="Nothing queued.">Every curator change waits here for {delayH} hours, visible to everyone, before it can take effect.</Empty>
          ) : (
            <ul>
              {open.map((q) => {
                const ready = q.state === "ready" || q.eta <= now;
                const m = markets.find((x) => x.address.toLowerCase() === q.market.toLowerCase());
                return (
                  <li key={q.id} className="px-5 py-4 border-b border-line last:border-0 grid gap-2">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm">{q.label} · <span className="text-mute">{m?.label ?? short(q.market)}</span></span>
                      {ready ? <Tag tone="ok">Ready to execute</Tag> : <Tag tone="warn">{left(q.eta, now)}</Tag>}
                    </div>
                    <div className="font-mono text-[10px] text-mute break-all">id {q.id}</div>
                    <div className="flex flex-wrap gap-2">
                      {explorer && <a href={`${explorer}/tx/${q.queuedTx}`} target="_blank" rel="noreferrer" className="h-8 px-3 grid place-items-center border border-line-2 font-mono text-[11px] text-mute hover:text-ink">Queue tx ↗</a>}
                      <button disabled={!onChain || !ready || !!busy} onClick={() => send(`x${q.id}`, "Change executed", `${q.label} · ${m?.label ?? short(q.market)}`, "execute", [q.id])}
                        className="h-8 px-3 border border-ok/60 font-mono text-[11px] text-ok disabled:opacity-40 disabled:cursor-not-allowed">{busy === `x${q.id}` ? "Executing…" : "Execute"}</button>
                      <button disabled={!onChain || !canCancel || !!busy} onClick={() => send(`c${q.id}`, "Change cancelled", `${q.label} · ${m?.label ?? short(q.market)}`, "cancel", [q.id])}
                        className="h-8 px-3 border border-bad/60 font-mono text-[11px] text-bad disabled:opacity-40 disabled:cursor-not-allowed">{busy === `c${q.id}` ? "Cancelling…" : "Cancel"}</button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          {msg && <p role="alert" className="px-5 py-3 border-t border-line text-xs text-bad">{msg}</p>}
        </Panel>
      </div>

      <Panel title="Curator action log" aside={<span className="font-mono text-[10px] text-mute">scanned to block #{scannedTo}</span>}>
        {log.length === 0 ? (
          <Empty title="No curator actions yet.">Queue, execute and cancel events from the CuratorRegistry appear here with their transaction.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px] text-sm">
              <thead className="border-b border-line"><tr><Th>Action</Th><Th>Change</Th><Th>Block</Th><Th>Tx</Th></tr></thead>
              <tbody>
                {log.map((e) => (
                  <tr key={`${e.tx}-${e.kind}-${e.id}`} className="border-b border-line last:border-0">
                    <td className="px-4 py-3"><Tag tone={e.kind === "Executed" ? "ok" : e.kind === "Cancelled" ? "bad" : "warn"}>{e.kind}</Tag></td>
                    <td className="px-4 py-3 text-ink-2">{e.label ?? <span className="font-mono text-xs text-mute">{short(e.id)}</span>}</td>
                    <td className="px-4 py-3 font-mono text-xs text-mute">#{e.block}</td>
                    <td className="px-4 py-3 font-mono text-xs">{explorer ? <a href={`${explorer}/tx/${e.tx}`} target="_blank" rel="noreferrer" className="text-bronze hover:underline">{short(e.tx)} ↗</a> : short(e.tx)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <TxModal data={receipt} explorer={explorer} chainName={n.chain.name} onClose={() => setReceipt(null)} />
    </div>
  );
}

function QueueForm(p: Omit<Parameters<typeof QueueFormInner>[0], "mi" | "setMi">) {
  const [mi, setMi] = useState(0);
  return <QueueFormInner key={mi} {...p} mi={mi} setMi={setMi} />;
}

function QueueFormInner({ markets, enabled, busy, delayH, onCaps, onHf, mi, setMi }: {
  mi: number; setMi: (i: number) => void;
  markets: CuratedMarket[]; enabled: boolean; busy: string | null; delayH: number;
  onCaps: (m: CuratedMarket, v: [bigint, bigint, bigint, bigint]) => void;
  onHf: (m: CuratedMarket, v: bigint) => void;
}) {
  const [kind, setKind] = useState<"caps" | "hf">("caps");
  const m = markets[mi];
  const [v, setV] = useState(() => m ? {
    supply: formatUnits(BigInt(m.caps.supply), m.loan.decimals), borrow: formatUnits(BigInt(m.caps.borrow), m.loan.decimals),
    walletSupply: formatUnits(BigInt(m.caps.walletSupply), m.loan.decimals), walletBorrow: formatUnits(BigInt(m.caps.walletBorrow), m.loan.decimals),
    hf: m.targetHfWad ? (Number(BigInt(m.targetHfWad)) / WAD).toString() : "1.05",
  } : null);
  if (!m || !v) return <Panel title="Queue a change"><Empty title="No market on this network." /></Panel>;

  let err: string | null = null;
  let caps: [bigint, bigint, bigint, bigint] | null = null;
  let hf: bigint | null = null;
  try {
    if (kind === "caps") caps = [v.supply, v.borrow, v.walletSupply, v.walletBorrow].map((x) => parseUnits(x || "0", m.loan.decimals)) as [bigint, bigint, bigint, bigint];
    else {
      const h = Number(v.hf);
      if (!(h >= 1.01 && h <= 2)) err = "Hard bound: target HF must be between 1.01 and 2.00. The market contract rejects anything else.";
      else hf = parseUnits(v.hf, 18);
    }
  } catch { err = "Enter plain numbers."; }

  const field = (k: keyof typeof v, label: string, unit: string) => (
    <label className="grid gap-1 text-xs text-mute">{label}
      <div className="flex border border-line-2 bg-bg"><input inputMode="decimal" value={v[k]} onChange={(e) => setV({ ...v, [k]: e.target.value })} className="flex-1 bg-transparent px-3 h-10 font-mono text-sm text-ink outline-none" /><span className="px-3 grid place-items-center font-mono text-[11px] text-mute">{unit}</span></div>
    </label>
  );

  return (
    <Panel title="Queue a change">
      <div className="p-5 grid gap-4">
        <div className="grid sm:grid-cols-2 gap-3">
          <label className="grid gap-1 text-xs text-mute">Market
            <select value={mi} onChange={(e) => setMi(Number(e.target.value))} className="h-10 border border-line-2 bg-bg px-3 text-sm text-ink">{markets.map((x, i) => <option key={x.address} value={i}>{x.label}</option>)}</select>
          </label>
          <label className="grid gap-1 text-xs text-mute">Parameter
            <select value={kind} onChange={(e) => setKind(e.target.value as "caps" | "hf")} className="h-10 border border-line-2 bg-bg px-3 text-sm text-ink"><option value="caps">Supply / borrow caps</option><option value="hf">Liquidation target HF</option></select>
          </label>
        </div>
        {kind === "caps" ? (
          <div className="grid sm:grid-cols-2 gap-3">
            {field("supply", "Market supply cap", m.loan.symbol)}{field("borrow", "Market borrow cap", m.loan.symbol)}
            {field("walletSupply", "Per-wallet supply cap", m.loan.symbol)}{field("walletBorrow", "Per-wallet borrow cap", m.loan.symbol)}
          </div>
        ) : (
          <>{field("hf", "Target health factor after liquidation", "HF")}<p className="font-mono text-[10px] text-mute">Hard bound in Market.sol: 1.01 – 2.00</p></>
        )}
        <p className="text-xs text-mute">Fields start at the live on-chain value. The change is only scheduled: it waits {delayH}h in the timelock, can be cancelled, and cannot move funds.</p>
        {err && <p className="text-xs text-bad">{err}</p>}
        <button disabled={!enabled || !!err || !!busy} onClick={() => (kind === "caps" ? caps && onCaps(m, caps) : hf && onHf(m, hf))}
          className="chamfer-sm h-11 bg-ink text-bg text-sm font-medium hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed">
          {busy === "q" ? "Confirm in wallet…" : enabled ? `Queue change · ${delayH}h timelock` : "Curator wallet required"}
        </button>
      </div>
    </Panel>
  );
}
