import "server-only";
import { createPublicClient, getAddress, http, parseAbi, type Address } from "viem";
import { CHAINS, type NetKey } from "@/lib/protocol";

// Real protocol events from Market contracts via eth_getLogs. No synthetic rows.
// Log scans need a provider with a usable eth_getLogs range. drpc free now rejects anything >100 blocks;
// daybreak (public, listed on chainlist for 4663) allows 2000. Override per env without code changes.
const RPC: Record<NetKey, string> = {
  testnet: process.env.LOGS_RPC_URL || process.env.RPC_URL || CHAINS.testnet.rpc,
  mainnet: process.env.MAINNET_LOGS_RPC_URL || "https://robinhood.daybreak-rpc.network",
};
const clients: Partial<Record<NetKey, ReturnType<typeof createPublicClient>>> = {};
const clientFor = (net: NetKey) =>
  (clients[net] ??= createPublicClient({ transport: http(RPC[net], { timeout: 15_000, retryCount: 1 }) }));

const events = parseAbi([
  "event Supplied(address indexed user, uint256 assets, uint256 shares)",
  "event Withdrawn(address indexed user, uint256 assets, uint256 shares)",
  "event CollateralAdded(address indexed user, uint256 assets)",
  "event CollateralRemoved(address indexed user, uint256 assets)",
  "event Borrowed(address indexed user, uint256 assets, uint256 sharesMinted)",
  "event Repaid(address indexed user, address indexed payer, uint256 assets, uint256 sharesBurned)",
  "event Liquidated(address indexed borrower, address indexed liquidator, uint256 repayAssets, uint256 seizeAssets)",
]);

export type EventName = "Supplied" | "Withdrawn" | "CollateralAdded" | "CollateralRemoved" | "Borrowed" | "Repaid" | "Liquidated";
/** `side` says which token the amount is denominated in. */
export type ActivityRow = {
  market: Address; event: EventName; user: Address; amount: bigint; side: "loan" | "collateral";
  tx: `0x${string}`; block: bigint; logIndex: number; t: number;
};

type State = { start: bigint; scanned: bigint; rows: ActivityRow[]; at: number };
const state = new Map<string, State>();
const blockTime = new Map<string, number>();
const TTL = 30_000;
const blockEnv = (v?: string) => (v && /^\d+$/.test(v.trim()) ? BigInt(v.trim()) : null);
const FROM_BLOCK: Record<NetKey, bigint | null> = {
  testnet: blockEnv(process.env.ACTIVITY_FROM_BLOCK),
  mainnet: blockEnv(process.env.MAINNET_ACTIVITY_FROM_BLOCK),
};
// Inclusive span per eth_getLogs request (daybreak: 2000 blocks). Halve on error.
const SPAN_ENV = blockEnv(process.env.LOGS_MAX_SPAN);
const MAX_SPAN = SPAN_ENV ?? BigInt(1_999);

async function logsRange(net: NetKey, market: Address[], from: bigint, to: bigint): Promise<Awaited<ReturnType<ReturnType<typeof createPublicClient>["getLogs"]>>> {
  const c = clientFor(net);
  try {
    return await c.getLogs({ address: market, events, fromBlock: from, toBlock: to } as never);
  } catch (e) {
    if (to - from < BigInt(50)) throw e;
    const mid = (from + to) / BigInt(2);
    return [...(await logsRange(net, market, from, mid)), ...(await logsRange(net, market, mid + BigInt(1), to))];
  }
}

function toRow(l: { address: Address; eventName: string; args: Record<string, unknown>; transactionHash: `0x${string}`; blockNumber: bigint; logIndex: number }): ActivityRow | null {
  const a = l.args;
  const base = { market: getAddress(l.address), tx: l.transactionHash, block: l.blockNumber, logIndex: l.logIndex, t: 0 };
  switch (l.eventName) {
    case "Supplied": case "Withdrawn": case "Borrowed":
      return { ...base, event: l.eventName, user: a.user as Address, amount: a.assets as bigint, side: "loan" };
    case "Repaid":
      return { ...base, event: "Repaid", user: a.user as Address, amount: a.assets as bigint, side: "loan" };
    case "CollateralAdded": case "CollateralRemoved":
      return { ...base, event: l.eventName, user: a.user as Address, amount: a.assets as bigint, side: "collateral" };
    case "Liquidated":
      return { ...base, event: "Liquidated", user: a.borrower as Address, amount: a.repayAssets as bigint, side: "loan" };
  }
  return null;
}

/** One scan covers every market in a single eth_getLogs (address array), resuming from the last scanned block. */
async function scan(net: NetKey, markets: Address[], head: bigint): Promise<ActivityRow[]> {
  const key = `${net}:${[...markets].map((m) => m.toLowerCase()).sort().join(",")}`;
  let s = state.get(key);
  if (s && Date.now() - s.at < TTL) return s.rows;
  if (!s) {
    // Pinned start (any block before the first protocol event); without it, scan only the last day.
    const pinned = FROM_BLOCK[net];
    const start = pinned !== null && pinned <= head ? pinned : head > BigInt(900_000) ? head - BigInt(900_000) : BigInt(0);
    s = { start, scanned: start - BigInt(1), rows: [], at: 0 };
    state.set(key, s);
  }
  const ranges: [bigint, bigint][] = [];
  for (let f = s.scanned + BigInt(1); f <= head; f += MAX_SPAN + BigInt(1)) {
    ranges.push([f, f + MAX_SPAN > head ? head : f + MAX_SPAN]);
  }
  // Progress is committed batch by batch: one failed request no longer throws away the whole scan.
  const c = clientFor(net);
  for (let i = 0; i < ranges.length; i += CONCURRENCY) {
    const slice = ranges.slice(i, i + CONCURRENCY);
    const batch = await Promise.all(slice.map(([f, t]) => withRetry(() => logsRange(net, markets, f, t))));
    const found: ActivityRow[] = [];
    for (const logs of batch) for (const l of logs) {
      const r = toRow(l as never);
      if (r) found.push(r);
    }
    await Promise.all([...new Set(found.map((r) => r.block))].map(async (bn) => {
      const k = `${net}:${bn}`;
      if (!blockTime.has(k)) blockTime.set(k, Number((await withRetry(() => c.getBlock({ blockNumber: bn }))).timestamp) * 1000);
    }));
    for (const r of found) r.t = blockTime.get(`${net}:${r.block}`) ?? 0;
    s.rows = [...s.rows, ...found];
    s.scanned = slice[slice.length - 1][1];
  }
  s.at = Date.now();
  return s.rows;
}

const CONCURRENCY = 8;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function withRetry<T>(f: () => Promise<T>, tries = 4): Promise<T> {
  for (let i = 0; ; i++) {
    try { return await f(); } catch (e) { if (i >= tries - 1) throw e; await sleep(400 * 2 ** i); }
  }
}

/** Mark a market's activity stale so the next read scans new blocks now (called after a confirmed tx). */
export function invalidateActivity(net: NetKey, market: Address) {
  const m = market.toLowerCase();
  for (const [k, s] of state) if (k.startsWith(`${net}:`) && k.includes(m)) s.at = 0;
}

/** All protocol events across markets, newest first. null = RPC failure (render an error, never fake rows). */
export async function readActivity(markets: Address[], net: NetKey, limit = 100): Promise<ActivityRow[] | null> {
  if (!markets.length) return [];
  try {
    const head = await clientFor(net).getBlockNumber();
    const all = await scan(net, markets, head);
    return [...all].sort((a, b) => (a.block === b.block ? b.logIndex - a.logIndex : a.block > b.block ? -1 : 1)).slice(0, limit);
  } catch {
    return null;
  }
}
