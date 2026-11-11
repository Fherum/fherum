import { NextResponse } from "next/server";
import { marketsFor, tryReadMarket } from "@/lib/chain";
import { assayRegistry, readAssay, type AssayView } from "@/lib/assay";

// Landing-page summary of the mainnet ASSAY registry. Read straight from chain, cached in memory for 5 minutes so
// the landing never waits on twelve registry reads. Returns ok:false rather than guessed numbers when the RPC fails.
export type AssaySummary =
  | { ok: true; tracked: number; open: number; dividends: number; top: { symbol: string; upliftPct: number } | null; asOf: number }
  | { ok: false };

const TTL = 5 * 60_000;
let cached: { at: number; v: AssaySummary } | null = null;

async function summarize(): Promise<AssaySummary> {
  const net = "mainnet" as const;
  if (!assayRegistry(net)) return { ok: false };
  const reads = await Promise.all(marketsFor(net).map((a) => tryReadMarket(a, net)));
  const ms = reads.flatMap((r) => (r.ok ? [r.m] : []));
  const rows: { symbol: string; a: AssayView }[] = [];
  let failed = 0;
  for (let i = 0; i < ms.length; i += 3) {
    const batch = await Promise.all(ms.slice(i, i + 3).map((m) =>
      readAssay(m.collateral.address, net).catch(() => readAssay(m.collateral.address, net)).catch(() => undefined)));
    batch.forEach((a, j) => (a === undefined ? failed++ : a && rows.push({ symbol: ms[i + j].collateral.symbol, a })));
  }
  if (failed || !rows.length) return { ok: false };
  const best = [...rows].sort((x, y) => y.a.upliftPct - x.a.upliftPct)[0];
  return {
    ok: true,
    tracked: rows.length,
    open: rows.filter((r) => r.a.open).length,
    dividends: rows.reduce((n, r) => n + r.a.entries.filter((e) => e.cls === "DIVIDEND").length, 0),
    top: best.a.upliftPct > 0 ? { symbol: best.symbol, upliftPct: best.a.upliftPct } : null,
    asOf: Date.now(),
  };
}

export async function GET() {
  if (!cached || Date.now() - cached.at > TTL) {
    const v = await summarize().catch((): AssaySummary => ({ ok: false }));
    // Only keep good reads; a failed read is retried on the next request instead of being served for 5 minutes.
    if (v.ok) cached = { at: Date.now(), v };
    else return NextResponse.json(cached?.v ?? v);
  }
  return NextResponse.json(cached.v, { headers: { "cache-control": "public, max-age=60" } });
}
