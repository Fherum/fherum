"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { createPublicClient, custom, formatUnits, parseAbi, type Address, type EIP1193Provider } from "viem";
import { useWallet, getProvider } from "@/components/wallet";
import { useNet } from "@/components/network-context";
import { Empty, Panel, Tag } from "@/components/ui";

/** Serializable market facts from the server page. */
export type PortfolioMarket = {
  address: Address;
  loan: { symbol: string; decimals: number };
  collateral: { symbol: string; decimals: number };
};

const abi = parseAbi([
  "function supplyShares(address) view returns (uint256)", "function supplyIndex() view returns (uint256)",
  "function collateralAssets(address) view returns (uint256)", "function debtAssets(address) view returns (uint256)",
  "function healthFactorWad(address) view returns (uint256)",
]);

type Row = { m: PortfolioMarket; supplied: bigint; collateral: bigint; debt: bigint; hf: bigint | null; failed?: boolean };
const ZERO = BigInt(0);
const RAY = BigInt(10) ** BigInt(27);

const fmt = (v: bigint, d: number, dp = 4) => {
  const [i, f = ""] = formatUnits(v, d).split(".");
  return `${BigInt(i).toLocaleString("en-US")}.${f.padEnd(dp, "0").slice(0, dp)}`;
};
const hfNum = (hf: bigint) => Number(hf / BigInt(1e14)) / 1e4;

/** Reads the connected wallet's position in every market, live from chain via the wallet's own provider. */
function usePositions(markets: PortfolioMarket[]) {
  const { w } = useWallet();
  const n = useNet();
  const user = w.status === "connected" ? (w.address as Address) : null;
  const onChain = w.status === "connected" && w.chainId === n.chain.id;
  const [rows, setRows] = useState<Row[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [at, setAt] = useState<number | null>(null);

  const load = useCallback(async () => {
    const eth = getProvider() as unknown as EIP1193Provider | null;
    if (!user || !onChain || !eth) { setRows(null); return; }
    const pub = createPublicClient({ transport: custom(eth) });
    try {
      const out = await Promise.all(markets.map(async (m) => {
        const r = (fn: "supplyIndex" | "supplyShares" | "collateralAssets" | "debtAssets" | "healthFactorWad") =>
          pub.readContract({ address: m.address, abi, functionName: fn, args: fn === "supplyIndex" ? [] : [user] } as never) as Promise<bigint>;
        try {
          const [shares, idx, collateral, debt] = await Promise.all([
            r("supplyShares"), r("supplyIndex"), r("collateralAssets"), r("debtAssets"),
          ]);
          // healthFactorWad reverts on a stale oracle (stock feeds over the weekend); balances stay readable.
          const hf = await r("healthFactorWad").catch(() => null);
          return { m, supplied: (shares * idx) / RAY, collateral, debt, hf } as Row;
        } catch {
          return { m, supplied: ZERO, collateral: ZERO, debt: ZERO, hf: null, failed: true } as Row;
        }
      }));
      if (out.every((x) => x.failed)) throw new Error("all failed");
      setRows(out); setErr(null); setAt(Date.now());
    } catch {
      setErr("Could not read your position from the chain. Nothing is shown rather than guessed.");
    }
  }, [user, onChain, markets]);

  useEffect(() => {
    queueMicrotask(() => { load(); });
    const t = setInterval(load, 15_000);
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);
    return () => { clearInterval(t); window.removeEventListener("focus", onFocus); };
  }, [load]);

  return { w, user, onChain, rows, err, at, reload: load };
}

function Gate({ markets, children }: { markets: PortfolioMarket[]; children: (p: ReturnType<typeof usePositions>) => React.ReactNode }) {
  const p = usePositions(markets);
  const { connect, switchChain } = useWallet();
  const n = useNet();
  if (!markets.length) return <Empty title="No market on this network yet." />;
  if (!p.user) return <Empty title="Connect a wallet to see your position." action={<button onClick={connect} className="text-sm text-bronze hover:underline underline-offset-4">Connect wallet →</button>} />;
  if (!p.onChain) return <Empty title={`Switch your wallet to ${n.chain.name}.`} action={<button onClick={() => switchChain()} className="text-sm text-bronze hover:underline underline-offset-4">Switch network →</button>} />;
  if (p.err) return <Empty title="Could not read your position.">{p.err}</Empty>;
  if (!p.rows) return <p role="status" className="px-6 py-10 font-mono text-[10px] uppercase text-mute motion-safe:animate-pulse">Reading chain…</p>;
  return <>{children(p)}</>;
}

const open = (r: Row) => r.failed || r.supplied > ZERO || r.collateral > ZERO || r.debt > ZERO;

function Table({ rows, at }: { rows: Row[]; at: number | null }) {
  const live = rows.filter(open);
  if (!live.length) return (
    <Empty title="No position yet." action={<Link href="/app/markets" className="text-sm text-bronze hover:underline underline-offset-4">Browse markets →</Link>}>
      This wallet has nothing supplied, posted as collateral or borrowed in any market.
    </Empty>
  );
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead><tr className="eyebrow text-left border-b border-line">
          {["Market", "Supplied", "Collateral", "Borrowed", "Health"].map((h) => <th key={h} className="px-5 py-3 font-normal">{h}</th>)}
        </tr></thead>
        <tbody>
          {live.map((r) => (
            <tr key={r.m.address} className="border-b border-line last:border-0">
              <td className="px-5 py-4"><Link href={`/app/markets/${r.m.address}`} className="hover:text-bronze">{r.m.collateral.symbol} / {r.m.loan.symbol} →</Link></td>
              {r.failed ? <td colSpan={4} className="px-5 py-4 text-xs text-warn">Could not read this market right now.</td> : <>
              <td className="px-5 py-4 num font-mono">{fmt(r.supplied, r.m.loan.decimals)} <span className="text-mute">{r.m.loan.symbol}</span></td>
              <td className="px-5 py-4 num font-mono">{fmt(r.collateral, r.m.collateral.decimals)} <span className="text-mute">{r.m.collateral.symbol}</span></td>
              <td className="px-5 py-4 num font-mono">{fmt(r.debt, r.m.loan.decimals)} <span className="text-mute">{r.m.loan.symbol}</span></td>
              <td className="px-5 py-4 num font-mono">{r.debt === ZERO ? <span className="text-mute">No debt</span> : r.hf === null ? <span className="text-warn">Oracle stale</span> : <span className={hfNum(r.hf) < 1.1 ? "text-bad" : hfNum(r.hf) < 1.5 ? "text-warn" : "text-ok"}>{hfNum(r.hf).toFixed(2)}</span>}</td></>}
            </tr>
          ))}
        </tbody>
      </table>
      {at && <p className="px-5 py-3 flex items-center gap-2 text-[11px] text-mute"><Tag tone="ok">Confirmed</Tag>Read from chain at {new Date(at).toLocaleTimeString()} · refreshes every 15s</p>}
    </div>
  );
}

/** Overview: positions table + worst Health Factor across markets. */
export function PortfolioOverview({ markets, mode }: { markets: PortfolioMarket[]; mode: string }) {
  return (
    <>
      <Panel title="Portfolio" aside={<Tag tone="warn">{mode} mode</Tag>}>
        <Gate markets={markets}>{(p) => <Table rows={p.rows!} at={p.at} />}</Gate>
      </Panel>
      <Panel title="Health">
        <Gate markets={markets}>{(p) => {
          const debtRows = p.rows!.filter((r) => r.debt > ZERO && r.hf !== null);
          const worst = debtRows.length ? Math.min(...debtRows.map((r) => hfNum(r.hf!))) : null;
          return (
            <div className="p-5 grid gap-4">
              <div className="flex items-end justify-between">
                <span className={`num font-display text-6xl leading-none ${worst === null ? "text-line-2" : worst < 1.1 ? "text-bad" : worst < 1.5 ? "text-warn" : "text-ok"}`}>{worst === null ? "—" : worst.toFixed(2)}</span>
                <Tag tone={worst === null ? "mute" : "ok"}>{worst === null ? "No debt" : "Lowest across markets"}</Tag>
              </div>
              <p className="text-xs text-mute leading-relaxed">Below 1.00 a position can be liquidated. Health Factor is computed on chain from oracle prices and the market&apos;s liquidation threshold.</p>
            </div>
          );
        }}</Gate>
      </Panel>
    </>
  );
}

/** Position page: same live table. */
export function PortfolioTable({ markets }: { markets: PortfolioMarket[] }) {
  return <Gate markets={markets}>{(p) => <Table rows={p.rows!} at={p.at} />}</Gate>;
}
