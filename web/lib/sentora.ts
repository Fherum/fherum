import "server-only";

// Read-only: public Morpho API, vaults whose curator is Sentora's on-chain curator address.
// No API key, no partnership implied. Source shown in the UI.
const SENTORA_CURATOR = "0x9e396dE3312D373b87F9BD8763fb48184b42aac0";
const QUERY = `{ vaultV2s(first:50, where:{curatorAddress_in:["${SENTORA_CURATOR}"]}){ items{ name address asset{symbol} totalAssetsUsd avgNetApy chain{id network} } } }`;

export type SentoraVault = { name: string; address: string; asset: string; chainId: number; network: string; tvlUsd: number; apy: number };

export async function readSentoraVaults(): Promise<SentoraVault[] | null> {
  try {
    const res = await fetch("https://api.morpho.org/graphql", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query: QUERY }),
      next: { revalidate: 600 },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const j = await res.json();
    type Raw = { name: string; address: string; asset?: { symbol: string }; totalAssetsUsd: number | null; avgNetApy: number | null; chain: { id: number; network: string } };
    const items: Raw[] = j?.data?.vaultV2s?.items ?? [];
    return items
      .filter((v) => v.name && !/deprecated/i.test(v.name) && (v.totalAssetsUsd ?? 0) >= 100_000)
      .map((v) => ({ name: v.name, address: v.address, asset: v.asset?.symbol ?? "", chainId: v.chain.id, network: v.chain.network, tvlUsd: v.totalAssetsUsd ?? 0, apy: v.avgNetApy ?? 0 }))
      .sort((a, b) => b.tvlUsd - a.tvlUsd);
  } catch {
    return null;
  }
}
