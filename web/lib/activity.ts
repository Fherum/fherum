import "server-only";
import { createPublicClient, http, parseAbi, type Address } from "viem";
import { CHAINS, type NetKey } from "@/lib/protocol";

// Real protocol events from Market contracts via eth_getLogs. No synthetic rows.
const RPC: Record<NetKey, string> = {
  testnet: process.env.RPC_URL || CHAINS.testnet.rpc,
  mainnet: process.env.MAINNET_RPC_URL || CHAINS.mainnet.rpc,
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
// Free RPC plans cap eth_getLogs ranges (drpc: 10k). Halve on error.
const MAX_SPAN = BigInt(9_999);

async function deployBlock(net: NetKey, market: Address, head: bigint) {
  const c = clientFor(net);
  let lo = BigInt(0), hi = head;
  while (lo < hi) {
    const mid = (lo + hi) / BigInt(2);
    const code = await c.getCode({ address: market, blockNumber: mid });
    if (code && code !== "0x") hi = mid; else lo = mid + BigInt(1);
  }
  return lo;
}

async function logsRange(net: NetKey, market: Address, from: bigint, to: bigint): Promise<Awaited<ReturnType<ReturnType<typeof createPublicClient>["getLogs"]>>> {
  const c = clientFor(net);
  try {
    return await c.getLogs({ address: market, events, fromBlock: from, toBlock: to } as never);
  } catch (e) {
    if (to - from < BigInt(50)) throw e;
    const mid = (from + to) / BigInt(2);
    return [...(await logsRange(net, market, from, mid)), ...(await logsRange(net, market, mid + BigInt(1), to))];
  }
}

function toRow(market: Address, l: { eventName: string; args: Record<string, unknown>; transactionHash: `0x${string}`; blockNumber: bigint; logIndex: number }): ActivityRow | null {
  const a = l.args;
  const base = { market, tx: l.transactionHash, block: l.blockNumber, logIndex: l.logIndex, t: 0 };
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

async function scanMarket(net: NetKey, market: Address, head: bigint): Promise<ActivityRow[]> {
  const key = `${net}:${market}`;
  let s = state.get(key);
  if (s && Date.now() - s.at < TTL) return s.rows;
  if (!s) {
    // Free RPCs cap getLogs at ~10k blocks, so scanning from genesis/deploy is slow. Pin a start block per network
    // (any block before the first protocol event) to keep page loads fast; falls back to the market's deploy block.
    const pinned = FROM_BLOCK[net];
    const start = pinned !== null && pinned <= head ? pinned : await deployBlock(net, market, head);
    s = { start, scanned: start - BigInt(1), rows: [], at: 0 };
  }
  const ranges: [bigint, bigint][] = [];
  for (let f = s.scanned + BigInt(1); f <= head; f += MAX_SPAN + BigInt(1)) {
    ranges.push([f, f + MAX_SPAN > head ? head : f + MAX_SPAN]);
  }
  const found: ActivityRow[] = [];
  for (let i = 0; i < ranges.length; i += 6) {
    const batch = await Promise.all(ranges.slice(i, i + 6).map(([f, t]) => logsRange(net, market, f, t)));
    for (const logs of batch) for (const l of logs) {
      const r = toRow(market, l as never);
      if (r) found.push(r);
    }
  }
  const c = clientFor(net);
  await Promise.all([...new Set(found.map((r) => r.block))].map(async (bn) => {
    const k = `${net}:${bn}`;
    if (!blockTime.has(k)) blockTime.set(k, Number((await c.getBlock({ blockNumber: bn })).timestamp) * 1000);
  }));
  for (const r of found) r.t = blockTime.get(`${net}:${r.block}`) ?? 0;
  s.rows = [...s.rows, ...found];
  s.scanned = head;
  s.at = Date.now();
  state.set(key, s);
  return s.rows;
}

/** All protocol events across markets, newest first. null = RPC failure (render an error, never fake rows). */
export async function readActivity(markets: Address[], net: NetKey, limit = 100): Promise<ActivityRow[] | null> {
  if (!markets.length) return [];
  try {
    const head = await clientFor(net).getBlockNumber();
    const all = (await Promise.all(markets.map((m) => scanMarket(net, m, head)))).flat();
    return all.sort((a, b) => (a.block === b.block ? b.logIndex - a.logIndex : a.block > b.block ? -1 : 1)).slice(0, limit);
  } catch {
    return null;
  }
}
