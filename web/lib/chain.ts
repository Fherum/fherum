import "server-only";
import { isAddress, parseAbi, type Address } from "viem";
import { NET_CONFIG, type NetKey } from "@/lib/protocol";
import { readClient } from "@/lib/rpc";

const clientFor = readClient;

const lensAbi = parseAbi([
  "struct MarketSnapshot { uint256 totalSupplyAssets; uint256 totalDebtAssets; uint256 totalSupplyShares; uint256 totalBorrowShares; uint256 totalCollateral; uint256 availableLiquidity; uint256 utilizationWad; uint256 borrowRatePerYearWad; uint256 supplyRatePerYearWad; uint256 supplyCap; uint256 borrowCap; uint256 walletSupplyCap; uint256 walletBorrowCap; uint256 ltvWad; uint256 liquidationThresholdWad; uint256 liquidationBonusWad; uint256 closeFactorWad; uint256 reserveFactorWad; uint256 dustValueWad; uint256 supplyIndex; uint256 borrowIndex; bool paused; bool borrowPaused; bool removeCollateralPaused; bool liquidationPaused; bool repayPaused; uint8 privacyMode; address eligibility; }",
  "function snapshot(address market) view returns (MarketSnapshot)",
]);
const marketAbi = parseAbi([
  "function collateralAsset() view returns (address)",
  "function borrowAsset() view returns (address)",
  "function oracle() view returns (address)",
  "function initialCurator() view returns (address)",
]);
const erc20Abi = parseAbi(["function symbol() view returns (string)", "function decimals() view returns (uint8)"]);

export type Snapshot = {
  [K in
    | "totalSupplyAssets" | "totalDebtAssets" | "totalSupplyShares" | "totalBorrowShares" | "totalCollateral"
    | "availableLiquidity" | "utilizationWad" | "borrowRatePerYearWad" | "supplyRatePerYearWad" | "supplyCap"
    | "borrowCap" | "walletSupplyCap" | "walletBorrowCap" | "ltvWad" | "liquidationThresholdWad"
    | "liquidationBonusWad" | "closeFactorWad" | "reserveFactorWad" | "dustValueWad" | "supplyIndex"
    | "borrowIndex"]: bigint;
} & {
  [K in "paused" | "borrowPaused" | "removeCollateralPaused" | "liquidationPaused" | "repayPaused"]: boolean;
} & { privacyMode: number; eligibility: Address };

export type Token = { address: Address; symbol: string; decimals: number };
export type MarketView = {
  address: Address;
  snap: Snapshot;
  collateral: Token;
  loan: Token;
  oracle: Address;
  curator: Address;
};

/** Market list comes from env (NEXT_PUBLIC_[MAINNET_]MARKETS, comma separated) — the registry has no enumeration. */
export const marketsFor = (net: NetKey): Address[] => NET_CONFIG[net].markets.filter((s) => isAddress(s));
/** Testnet list (back-compat). */
export const MARKETS: Address[] = marketsFor("testnet");

async function token(client: ReturnType<typeof readClient>, address: Address): Promise<Token> {
  const [symbol, decimals] = await Promise.all([
    client.readContract({ address, abi: erc20Abi, functionName: "symbol" }),
    client.readContract({ address, abi: erc20Abi, functionName: "decimals" }),
  ]);
  return { address, symbol, decimals };
}

export async function readMarket(market: Address, net: NetKey = "testnet"): Promise<MarketView> {
  const client = clientFor(net);
  const lens = NET_CONFIG[net].lensReader;
  if (!lens) throw new Error("LensReader not configured");
  const [snap, col, bor, oracle, curator] = await Promise.all([
    client.readContract({ address: lens, abi: lensAbi, functionName: "snapshot", args: [market] }),
    client.readContract({ address: market, abi: marketAbi, functionName: "collateralAsset" }),
    client.readContract({ address: market, abi: marketAbi, functionName: "borrowAsset" }),
    client.readContract({ address: market, abi: marketAbi, functionName: "oracle" }),
    client.readContract({ address: market, abi: marketAbi, functionName: "initialCurator" }),
  ]);
  const [collateral, loan] = await Promise.all([token(client, col), token(client, bor)]);
  return { address: market, snap: snap as Snapshot, collateral, loan, oracle, curator };
}

/** Returns the market or an error message — never throws into the page. */
type TryRead = { ok: true; m: MarketView } | { ok: false; error: string };

export async function tryReadMarket(market: Address, net: NetKey = "testnet"): Promise<TryRead> {
  try {
    return { ok: true, m: await readMarket(market, net) };
  } catch (e) {
    return { ok: false, error: describeRpcError(e) };
  }
}

/** One-line error with HTTP status / network cause, so a bad RPC env is diagnosable. URLs are stripped (they may hold a provider key). */
function describeRpcError(e: unknown): string {
  const parts: string[] = [];
  for (let x: unknown = e, i = 0; x && i < 5; x = (x as { cause?: unknown }).cause, i++) {
    const o = x as { shortMessage?: string; message?: string; status?: number; code?: string | number };
    const line = (o.shortMessage ?? o.message ?? String(x)).split("\n")[0];
    if (o.status) parts.push(`status ${o.status}`);
    if (typeof o.code === "string") parts.push(o.code);
    if (line && !parts.includes(line)) parts.push(line);
  }
  return parts.join(" · ").replace(/https?:\/\/\S+/g, "<rpc>").slice(0, 200);
}

// ---- formatting (WAD = 1e18) ----
const WAD = BigInt(1e18);
export const pct = (wad: bigint, dp = 2) => `${(Number((wad * BigInt(10) ** BigInt(dp + 2)) / WAD) / 10 ** dp).toFixed(dp)}%`;
export const amt = (v: bigint, decimals: number, dp = 2) => {
  const base = BigInt(10) ** BigInt(decimals);
  const whole = v / base;
  const frac = ((v % base) * BigInt(10) ** BigInt(dp)) / base;
  return `${whole.toLocaleString("en-US")}${dp ? "." + frac.toString().padStart(dp, "0") : ""}`;
};
export const wadNum = (wad: bigint, dp = 4) => (Number((wad * BigInt(10) ** BigInt(dp)) / WAD) / 10 ** dp).toString();
export const ray = (v: bigint) => (Number((v * BigInt(10) ** BigInt(6)) / BigInt(10) ** BigInt(27)) / 1e6).toFixed(6);
