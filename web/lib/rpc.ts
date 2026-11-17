import "server-only";
import { createPublicClient, defineChain, fallback, http, type Chain, type HttpTransportConfig, type Transport } from "viem";
import { CHAINS, type NetKey } from "@/lib/protocol";

// Server-only reads. RPC_URL / MAINNET_RPC_URL may contain a provider key (Alchemy), so they are never NEXT_PUBLIC.
export const READ_RPC: Record<NetKey, string> = {
  testnet: process.env.RPC_URL || CHAINS.testnet.rpc,
  mainnet: process.env.MAINNET_RPC_URL || CHAINS.mainnet.rpc,
};

// Multicall3 is deployed at the canonical address on mainnet 4663 (verified with `cast code`).
// Folding a page's parallel eth_calls into a few aggregate3 calls keeps keyed providers (Alchemy) under their
// per-second limit — without it a single /app/markets render fires ~150 calls and gets HTTP 429.
const MULTICALL3 = "0xcA11bde05977b3631167028862bE2a173976CA11" as const;
const VIEM_CHAIN: Record<NetKey, Chain> = {
  testnet: defineChain({ id: CHAINS.testnet.id, name: CHAINS.testnet.name, nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 }, rpcUrls: { default: { http: [CHAINS.testnet.rpc] } } }),
  mainnet: defineChain({
    id: CHAINS.mainnet.id, name: CHAINS.mainnet.name, nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: { default: { http: [CHAINS.mainnet.rpc] } },
    contracts: { multicall3: { address: MULTICALL3 } },
  }),
};

/**
 * HTTP transport for a server RPC URL. When the URL is a keyed provider (e.g. Alchemy free tier, ~500 CU/s),
 * a 429 or outage falls through to the chain's public RPC instead of failing the page.
 */
export function rpcTransport(url: string, net: NetKey, opts: HttpTransportConfig = {}): Transport {
  const cfg: HttpTransportConfig = { timeout: 10_000, ...opts };
  const pub = CHAINS[net].rpc;
  if (url === pub) return http(url, { retryCount: 2, retryDelay: 250, ...cfg });
  return fallback([http(url, { ...cfg, retryCount: 0 }), http(pub, { retryCount: 2, retryDelay: 250, ...cfg })]);
}

const make = (net: NetKey) =>
  createPublicClient({
    chain: VIEM_CHAIN[net],
    batch: { multicall: net === "mainnet" ? { wait: 16, batchSize: 4096 } : false },
    transport: rpcTransport(READ_RPC[net], net),
  });

const clients: Partial<Record<NetKey, ReturnType<typeof make>>> = {};
/** Shared server read client per network: multicall-batched on mainnet, retries on rate limits. */
export const readClient = (net: NetKey) => (clients[net] ??= make(net));
