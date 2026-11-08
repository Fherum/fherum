import "server-only";
import { createPublicClient, http, parseAbi, type Address } from "viem";
import { CHAINS, NET_CONFIG, type NetKey } from "@/lib/protocol";

// Real on-chain history: LensReader.snapshot(market) read at past blocks (archive RPC). No synthetic points.
const RPC: Record<NetKey, string> = {
  testnet: process.env.RPC_URL || CHAINS.testnet.rpc,
  mainnet: process.env.MAINNET_RPC_URL || CHAINS.mainnet.rpc,
};
const clients: Partial<Record<NetKey, ReturnType<typeof createPublicClient>>> = {};
const clientFor = (net: NetKey) =>
  (clients[net] ??= createPublicClient({ transport: http(RPC[net], { timeout: 10_000, retryCount: 1 }) }));

const lensAbi = parseAbi([
  "struct S { uint256 totalSupplyAssets; uint256 totalDebtAssets; uint256 totalSupplyShares; uint256 totalBorrowShares; uint256 totalCollateral; uint256 availableLiquidity; uint256 utilizationWad; uint256 borrowRatePerYearWad; uint256 supplyRatePerYearWad; uint256 supplyCap; uint256 borrowCap; uint256 walletSupplyCap; uint256 walletBorrowCap; uint256 ltvWad; uint256 liquidationThresholdWad; uint256 liquidationBonusWad; uint256 closeFactorWad; uint256 reserveFactorWad; uint256 dustValueWad; uint256 supplyIndex; uint256 borrowIndex; bool paused; bool borrowPaused; bool removeCollateralPaused; bool liquidationPaused; bool repayPaused; uint8 privacyMode; address eligibility; }",
  "function snapshot(address market) view returns (S)",
]);

export type HistPoint = { t: number; supply: number; debt: number; util: number; supplyApy: number; borrowApy: number };
export type History = { points: HistPoint[]; fromBlock: string; toBlock: string };

const cache = new Map<string, { at: number; v: History }>();
const TTL = 5 * 60_000;
const firstBlock = new Map<string, bigint>();

/** Binary-search the first block where both contracts have code. */
async function deployBlock(net: NetKey, a: Address, b: Address, head: bigint) {
  const k = `${net}:${a}:${b}`;
  const hit = firstBlock.get(k);
  if (hit !== undefined) return hit;
  const c = clientFor(net);
  const has = async (n: bigint) => {
    const [x, y] = await Promise.all([c.getCode({ address: a, blockNumber: n }), c.getCode({ address: b, blockNumber: n })]);
    return !!x && x !== "0x" && !!y && y !== "0x";
  };
  let lo = BigInt(0), hi = head;
  while (lo < hi) {
    const mid = (lo + hi) / BigInt(2);
    if (await has(mid)) hi = mid; else lo = mid + BigInt(1);
  }
  firstBlock.set(k, lo);
  return lo;
}

const n = (v: bigint, d: number) => Number(v) / 10 ** d;
const w = (v: bigint) => Number(v) / 1e18;

/** Drop cached chart history for a market so the next render includes the latest block. */
export function invalidateHistory(net: NetKey, market: Address) {
  for (const k of [...cache.keys()]) if (k.startsWith(`${net}:${market}:`)) cache.delete(k);
}

export async function readHistory(market: Address, net: NetKey, decimals: number, samples = 30): Promise<History | null> {
  const key = `${net}:${market}:${samples}`;
  const c0 = cache.get(key);
  if (c0 && Date.now() - c0.at < TTL) return c0.v;
  const lens = NET_CONFIG[net].lensReader;
  if (!lens) return null;
  try {
    const c = clientFor(net);
    const head = await c.getBlockNumber();
    const start = await deployBlock(net, market, lens, head);
    const span = head - start;
    const blocks = Array.from({ length: samples }, (_, i) => start + (span * BigInt(i)) / BigInt(samples - 1));
    const points = await Promise.all(blocks.map(async (bn) => {
      const [s, blk] = await Promise.all([
        c.readContract({ address: lens, abi: lensAbi, functionName: "snapshot", args: [market], blockNumber: bn }),
        c.getBlock({ blockNumber: bn }),
      ]);
      return { t: Number(blk.timestamp) * 1000, supply: n(s.totalSupplyAssets, decimals), debt: n(s.totalDebtAssets, decimals),
        util: w(s.utilizationWad), supplyApy: w(s.supplyRatePerYearWad), borrowApy: w(s.borrowRatePerYearWad) };
    }));
    const v = { points, fromBlock: start.toString(), toBlock: head.toString() };
    cache.set(key, { at: Date.now(), v });
    return v;
  } catch {
    return null;
  }
}
