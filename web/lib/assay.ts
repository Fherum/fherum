import "server-only";
import { createPublicClient, http, isAddress, parseAbi, type Address } from "viem";
import { CHAINS, type NetKey } from "@/lib/protocol";
import { readClient } from "@/lib/rpc";

// ASSAY registry (src/AssayRegistry.sol): classifies ERC-8056 multiplier changes of stock collateral.
// Server-only: MAINNET_RPC_URL may hold a provider key. Every figure here is a direct contract read.
const ASSAY: Record<NetKey, Address | null> = {
  mainnet: pick(process.env.NEXT_PUBLIC_MAINNET_ASSAY, "0x4DF4DB5C5Eb920a2E98C0B6ddD579cFB1655d56A"),
  testnet: pick(process.env.NEXT_PUBLIC_ASSAY, null),
};
export const assayRegistry = (net: NetKey): Address | null => ASSAY[net];
function pick(v: string | undefined, d: Address | null): Address | null {
  return v && isAddress(v) ? (v as Address) : d;
}
const RPC: Record<NetKey, string> = {
  testnet: process.env.RPC_URL || CHAINS.testnet.rpc,
  mainnet: process.env.MAINNET_RPC_URL || CHAINS.mainnet.rpc,
};
// Logs go to a getLogs-friendly RPC (same split as lib/activity.ts).
const LOGS_RPC: Record<NetKey, string> = {
  testnet: process.env.LOGS_RPC_URL || RPC.testnet,
  mainnet: process.env.MAINNET_LOGS_RPC_URL || "https://robinhood.daybreak-rpc.network",
};
const mk = (url: string) => createPublicClient({ transport: http(url, { timeout: 10_000, retryCount: 1 }) });
const clients: Record<string, ReturnType<typeof mk>> = {};
const client = (url: string) => (clients[url] ??= mk(url));

const abi = parseAbi([
  "struct Entry { uint64 eventId; uint8 class; uint256 mPrev; uint256 mNow; uint256 dividendIndex; uint64 effectiveAt; uint64 recordedAt; uint64 blockNumber; }",
  "struct StatusView { uint8 state; uint64 eventId; uint64 since; uint64 reopensNoEarlierThan; }",
  "function isRegistered(address) view returns (bool)",
  "function isOpen(address) view returns (bool)",
  "function status(address) view returns (StatusView)",
  "function dividendIndex(address) view returns (uint256)",
  "function lastMultiplier(address) view returns (uint256)",
  "function historyLength(address) view returns (uint256)",
  "function history(address, uint256, uint256) view returns (Entry[])",
]);
const tokenAbi = parseAbi(["function uiMultiplier() view returns (uint256)"]);

export const STATES = ["NORMAL", "CORP_ACTION_PENDING", "CORP_ACTION_ACTIVE", "UNEXPLAINED", "ISSUER_PAUSED"] as const;
export const CLASSES = ["DIVIDEND", "CORP_ACTION", "UNEXPLAINED"] as const;
export type AssayState = (typeof STATES)[number];

// Serializable (strings / numbers only) so it can cross into client components.
export type AssayEntry = {
  eventId: number; cls: (typeof CLASSES)[number]; mPrev: string; mNow: string; dividendIndex: string;
  upliftPct: number; recordedAt: number; blockNumber: number; tx: string | null;
};
export type AssayView = {
  registry: Address; asset: Address; open: boolean; state: AssayState; reopensNoEarlierThan: number;
  dividendIndex: string; upliftPct: number; tokenMultiplier: string; lastMultiplier: string; entries: AssayEntry[]; asOf: number;
};

const WAD = BigInt(10) ** BigInt(18);
// (a/b - 1) in percent, computed in bigint first so tiny uplifts keep their precision.
const upPct = (a: bigint, b: bigint) => (b === BigInt(0) ? 0 : Number(((a - b) * BigInt(10) ** BigInt(8)) / b) / 1e6);

// Entry.blockNumber is block.number inside the contract, which on Robinhood Chain (Arbitrum Orbit) is the L1
// block, so the tx is located by recordedAt instead: binary-search the first L2 block with timestamp >= recordedAt,
// then read registry logs in a small window. Results are immutable, so they are cached forever.
const ASSAY_FROM_BLOCK: Record<NetKey, bigint> = {
  mainnet: BigInt(process.env.MAINNET_ASSAY_FROM_BLOCK || "111780000"),
  testnet: BigInt(process.env.ASSAY_FROM_BLOCK || "0"),
};
const txCache = new Map<string, string | null>();
async function txAt(net: NetKey, registry: Address, asset: Address, ts: number): Promise<string | null> {
  const key = `${net}:${asset.toLowerCase()}:${ts}`;
  if (txCache.has(key)) return txCache.get(key)!;
  try {
    const c = readClient(net);
    let lo = ASSAY_FROM_BLOCK[net], hi = await c.getBlockNumber();
    while (lo < hi) {
      const mid = (lo + hi) / BigInt(2);
      if (Number((await c.getBlock({ blockNumber: mid })).timestamp) < ts) lo = mid + BigInt(1); else hi = mid;
    }
    const logs = await client(LOGS_RPC[net]).getLogs({ address: registry, fromBlock: lo, toBlock: lo + BigInt(40) });
    const pad = asset.toLowerCase().slice(2).padStart(64, "0");
    const tx = logs.find((l) => l.topics[1]?.toLowerCase().endsWith(pad))?.transactionHash ?? null;
    if (tx) txCache.set(key, tx);
    return tx;
  } catch {
    return null;
  }
}

const cache = new Map<string, { at: number; v: AssayView | null }>();
const TTL = 60_000;

/** null = no ASSAY on this net or asset not registered (non-stock collateral). Throws only on RPC failure. */
export async function readAssay(asset: Address, net: NetKey): Promise<AssayView | null> {
  const registry = ASSAY[net];
  if (!registry) return null;
  const key = `${net}:${asset.toLowerCase()}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return hit.v;

  const c = readClient(net);
  const read = <T,>(functionName: string, args: unknown[]) =>
    c.readContract({ address: registry, abi, functionName, args } as never) as Promise<T>;
  if (!(await read<boolean>("isRegistered", [asset]))) {
    cache.set(key, { at: Date.now(), v: null });
    return null;
  }
  const [open, st, idx, last, len, tokenM] = await Promise.all([
    read<boolean>("isOpen", [asset]),
    read<{ state: number; reopensNoEarlierThan: bigint }>("status", [asset]),
    read<bigint>("dividendIndex", [asset]),
    read<bigint>("lastMultiplier", [asset]),
    read<bigint>("historyLength", [asset]),
    c.readContract({ address: asset, abi: tokenAbi, functionName: "uiMultiplier" }),
  ]);
  const n = Number(len);
  const raw = n ? await read<readonly { eventId: bigint; class: number; mPrev: bigint; mNow: bigint; dividendIndex: bigint; recordedAt: bigint; blockNumber: bigint }[]>("history", [asset, BigInt(Math.max(0, n - 20)), len]) : [];
  const txs = await Promise.all(raw.map((e) => txAt(net, registry, asset, Number(e.recordedAt))));
  const entries: AssayEntry[] = raw.map((e, i) => ({
    eventId: Number(e.eventId), cls: CLASSES[e.class] ?? "UNEXPLAINED",
    mPrev: e.mPrev.toString(), mNow: e.mNow.toString(), dividendIndex: e.dividendIndex.toString(),
    upliftPct: upPct(e.mNow, e.mPrev), recordedAt: Number(e.recordedAt), blockNumber: Number(e.blockNumber), tx: txs[i],
  })).reverse();

  const v: AssayView = {
    registry, asset, open, state: STATES[st.state] ?? "UNEXPLAINED", reopensNoEarlierThan: Number(st.reopensNoEarlierThan),
    dividendIndex: idx.toString(), upliftPct: upPct(idx, WAD),
    tokenMultiplier: (tokenM as bigint).toString(), lastMultiplier: last.toString(), entries, asOf: Date.now(),
  };
  cache.set(key, { at: Date.now(), v });
  return v;
}
