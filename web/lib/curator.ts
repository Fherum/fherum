import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";
import { createPublicClient, http, parseAbi, type Address } from "viem";
import { CHAINS, type NetKey } from "@/lib/protocol";
import { DEPLOYMENTS } from "@/lib/deployments";

// Curator console data: real CuratorRegistry events + live timelock state. No synthetic rows.
// Logs go through the same range-friendly RPC as Activity; point reads through the regular server RPC.
const LOGS_RPC: Record<NetKey, string> = {
  testnet: process.env.LOGS_RPC_URL || process.env.RPC_URL || CHAINS.testnet.rpc,
  mainnet: process.env.MAINNET_LOGS_RPC_URL || "https://robinhood.daybreak-rpc.network",
};
const READ_RPC: Record<NetKey, string> = {
  testnet: process.env.RPC_URL || CHAINS.testnet.rpc,
  mainnet: process.env.MAINNET_RPC_URL || CHAINS.mainnet.rpc,
};
const mk = (url: string) => createPublicClient({ transport: http(url, { timeout: 15_000, retryCount: 1 }) });
const logsC: Partial<Record<NetKey, ReturnType<typeof mk>>> = {};
const readC: Partial<Record<NetKey, ReturnType<typeof mk>>> = {};

const blockEnv = (v?: string) => (v && /^\d+$/.test(v.trim()) ? BigInt(v.trim()) : null);
// Registry deploy blocks (broadcast receipts). Scanning earlier is wasted work.
const FROM: Record<NetKey, bigint> = {
  mainnet: blockEnv(process.env.MAINNET_CURATOR_FROM_BLOCK) ?? BigInt(107_442_000),
  testnet: blockEnv(process.env.CURATOR_FROM_BLOCK) ?? BigInt(0),
};
const SPAN = blockEnv(process.env.LOGS_MAX_SPAN) ?? BigInt(1_999);

export const registryFor = (net: NetKey): Address | null =>
  (DEPLOYMENTS[net].contracts.find((c) => c.name === "CuratorRegistry")?.address as Address | undefined) ?? null;

const regAbi = parseAbi([
  "event UpdateQueued(bytes32 indexed id, address indexed market, bytes4 indexed selector, uint256 eta)",
  "event UpdateExecuted(bytes32 indexed id, address indexed market)",
  "event UpdateCancelled(bytes32 indexed id, address indexed caller)",
  "function timelock() view returns (address)",
  "function hasRole(bytes32,address) view returns (bool)",
]);
const tlAbi = parseAbi(["function getTimestamp(bytes32) view returns (uint256)", "function getMinDelay() view returns (uint256)"]);

export const SELECTOR_LABEL: Record<string, string> = {
  "0x3dcfd406": "Risk params",
  "0x82872491": "Caps",
  "0xb02867c3": "Rate params",
  "0x9571979b": "Target health factor",
  "0x6f0ffb9f": "Eligibility gate",
  "0xe74b981b": "Fee recipient",
  "0xb158abdc": "Curator fee share",
  "0x16de1335": "Fee recipients",
};

export type CuratorEvent = {
  kind: "Queued" | "Executed" | "Cancelled";
  id: `0x${string}`;
  market?: Address;
  selector?: `0x${string}`;
  eta?: number;
  caller?: Address;
  tx: `0x${string}`;
  block: string;
  logIndex: number;
};
export type QueueItem = {
  id: `0x${string}`;
  market: Address;
  selector: `0x${string}`;
  eta: number;
  queuedTx: `0x${string}`;
  state: "waiting" | "ready" | "done" | "cancelled";
};
export type CuratorData = {
  registry: Address;
  timelock: Address;
  minDelay: number;
  events: CuratorEvent[];
  queue: QueueItem[];
  scannedTo: string;
  /** True while the event scan is still catching up; queue/log may be incomplete. */
  scanning: boolean;
};

type Cache = { at: number; to: bigint; events: CuratorEvent[] };
// Kept on globalThis so dev hot-reloads don't throw away a finished scan, and mirrored to disk so a
// server restart resumes from the last scanned block instead of rescanning from the deploy block.
const G = globalThis as unknown as { __fherumCurator?: { cache: Map<NetKey, Cache>; scans: Map<NetKey, Promise<Cache>> } };
const store = (G.__fherumCurator ??= { cache: new Map(), scans: new Map() });
const TTL = 30_000;
const WAIT_MS = 6_000;
const diskPath = (net: NetKey) => path.join(process.cwd(), ".next", "cache", `fherum-curator-${net}.json`);

async function loadDisk(net: NetKey, registry: Address): Promise<Cache | undefined> {
  try {
    const j = JSON.parse(await fs.readFile(diskPath(net), "utf8"));
    if (j.registry?.toLowerCase() !== registry.toLowerCase()) return undefined;
    return { at: 0, to: BigInt(j.to), events: j.events };
  } catch { return undefined; }
}
async function saveDisk(net: NetKey, registry: Address, c: Cache) {
  try {
    await fs.mkdir(path.dirname(diskPath(net)), { recursive: true });
    await fs.writeFile(diskPath(net), JSON.stringify({ registry, to: c.to.toString(), events: c.events }));
  } catch { /* read-only FS: memory cache still works */ }
}

async function retry<T>(f: () => Promise<T>, n = 4): Promise<T> {
  for (let i = 0; ; i++) {
    try { return await f(); } catch (e) { if (i >= n - 1) throw e; await new Promise((r) => setTimeout(r, 300 * (i + 1))); }
  }
}

async function scan(net: NetKey, registry: Address, from: bigint, to: bigint): Promise<CuratorEvent[]> {
  const c = (logsC[net] ??= mk(LOGS_RPC[net]));
  const ranges: [bigint, bigint][] = [];
  for (let s = from; s <= to; s += SPAN + BigInt(1)) ranges.push([s, s + SPAN > to ? to : s + SPAN]);
  const out: CuratorEvent[] = [];
  let i = 0;
  const worker = async () => {
    while (i < ranges.length) {
      const [a, b] = ranges[i++];
      const logs = await retry(() => c.getLogs({ address: registry, events: regAbi.filter((x) => x.type === "event"), fromBlock: a, toBlock: b } as never));
      for (const l of logs as unknown as { eventName: string; args: Record<string, unknown>; transactionHash: `0x${string}`; blockNumber: bigint; logIndex: number }[]) {
        const base = { id: l.args.id as `0x${string}`, tx: l.transactionHash, block: l.blockNumber.toString(), logIndex: l.logIndex };
        if (l.eventName === "UpdateQueued") out.push({ ...base, kind: "Queued", market: l.args.market as Address, selector: l.args.selector as `0x${string}`, eta: Number(l.args.eta) });
        else if (l.eventName === "UpdateExecuted") out.push({ ...base, kind: "Executed", market: l.args.market as Address });
        else if (l.eventName === "UpdateCancelled") out.push({ ...base, kind: "Cancelled", caller: l.args.caller as Address });
      }
    }
  };
  await Promise.all(Array.from({ length: 8 }, worker));
  return out;
}

const mktAbi = parseAbi(["function targetHealthFactorWad() view returns (uint256)"]);
export async function readTargetHf(net: NetKey, market: Address): Promise<bigint | null> {
  try {
    return (await (readC[net] ??= mk(READ_RPC[net])).readContract({ address: market, abi: mktAbi, functionName: "targetHealthFactorWad" })) as bigint;
  } catch { return null; }
}

export function invalidateCurator(net: NetKey) {
  const c = store.cache.get(net);
  if (c) c.at = 0;
}

/** Brings the event cache up to the chain head. One scan per network at a time; it keeps running
 *  in the background even if the page stops waiting for it. */
function refresh(net: NetKey, registry: Address): Promise<Cache> {
  const running = store.scans.get(net);
  if (running) return running;
  const run = (async () => {
    let c = store.cache.get(net) ?? (await loadDisk(net, registry));
    const head = await (logsC[net] ??= mk(LOGS_RPC[net])).getBlockNumber();
    const from = c ? c.to + BigInt(1) : FROM[net];
    const fresh = from <= head ? await scan(net, registry, from, head) : [];
    c = { at: Date.now(), to: head, events: [...(c?.events ?? []), ...fresh] };
    store.cache.set(net, c);
    void saveDisk(net, registry, c);
    return c;
  })().finally(() => store.scans.delete(net));
  store.scans.set(net, run);
  return run;
}

export async function readCurator(net: NetKey): Promise<CuratorData | null> {
  return compute(net);
}

async function compute(net: NetKey): Promise<CuratorData | null> {
  const registry = registryFor(net);
  if (!registry) return null;
  const rc = (readC[net] ??= mk(READ_RPC[net]));
  try {
    const timelock = (await rc.readContract({ address: registry, abi: regAbi, functionName: "timelock" })) as Address;
    const minDelay = Number(await rc.readContract({ address: timelock, abi: tlAbi, functionName: "getMinDelay" }));
    let c = store.cache.get(net);
    let scanning = false;
    if (!c || Date.now() - c.at > TTL) {
      const run = refresh(net, registry);
      run.catch(() => {}); // a failed background scan is retried on the next request
      const timedOut = Symbol();
      const r = await Promise.race([run, new Promise<typeof timedOut>((res) => setTimeout(() => res(timedOut), WAIT_MS))]);
      if (r === timedOut) {
        // Don't block the page on a long history scan: show live market state now, history when ready.
        scanning = true;
        c = store.cache.get(net) ?? (await loadDisk(net, registry)) ?? { at: 0, to: FROM[net] - BigInt(1), events: [] };
      } else c = r;
    }
    const events = [...c.events].sort((a, b) => (BigInt(b.block) === BigInt(a.block) ? b.logIndex - a.logIndex : BigInt(b.block) > BigInt(a.block) ? 1 : -1));
    const closed = new Map<string, "done" | "cancelled">();
    for (const e of events) if (e.kind !== "Queued") closed.set(e.id, e.kind === "Executed" ? "done" : "cancelled");
    const now = Math.floor(Date.now() / 1000);
    const queue: QueueItem[] = await Promise.all(events.filter((e) => e.kind === "Queued").map(async (e) => {
      let state: QueueItem["state"] = closed.get(e.id) ?? "waiting";
      if (state === "waiting") {
        const ts = Number(await rc.readContract({ address: timelock, abi: tlAbi, functionName: "getTimestamp", args: [e.id] }));
        state = ts === 0 ? "cancelled" : ts === 1 ? "done" : ts <= now ? "ready" : "waiting";
      }
      return { id: e.id, market: e.market!, selector: e.selector!, eta: e.eta!, queuedTx: e.tx, state };
    }));
    return { registry, timelock, minDelay, events, queue, scannedTo: c.to.toString(), scanning };
  } catch {
    return null;
  }
}
