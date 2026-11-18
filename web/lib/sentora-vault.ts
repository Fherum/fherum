// Client-side Sentora Morpho vault module (pattern from resources.vaults.sentora.com, Morpho vaults).
// Plans come from the public @sentora/vaults-morpho SDK; the user's own wallet signs every step.
// Reads use a public Ethereum RPC on purpose: keyed RPC URLs never reach the browser.
import { getPosition as readPosition, getVaultMeta, planDeposit, planRedeem } from "@sentora/vaults-morpho";
import type { Plan } from "@sentora/vaults-plan";
import { createPublicClient, createWalletClient, custom, formatUnits, http, parseUnits, type Address, type EIP1193Provider, type Hex } from "viem";
import { mainnet } from "viem/chains";

export const ETH_PUBLIC_RPC = "https://ethereum-rpc.publicnode.com";
const client = createPublicClient({ chain: mainnet, transport: http(ETH_PUBLIC_RPC) });

export type Step = { label: string; hash?: Hex; state: "pending" | "sent" | "done" };

async function send(plan: Plan, eth: EIP1193Provider, onStep: (s: Step[]) => void): Promise<Hex[]> {
  const [blocker] = plan.blockers;
  if (blocker) throw Object.assign(new Error(blocker.message), blocker);
  const wallet = createWalletClient({ chain: mainnet, transport: custom(eth) });
  if ((await wallet.getChainId()) !== mainnet.id) await wallet.switchChain({ id: mainnet.id });
  const [account] = await wallet.getAddresses();
  const steps: Step[] = plan.steps.map((s, i) => ({ label: (s as { kind?: string }).kind ?? `Step ${i + 1}`, state: "pending" }));
  onStep([...steps]);
  const hashes: Hex[] = [];
  for (const [i, { to, data, value }] of plan.steps.entries()) {
    const hash = await wallet.sendTransaction({ account, chain: mainnet, to, data, value: BigInt(value) });
    steps[i] = { ...steps[i], hash, state: "sent" }; onStep([...steps]);
    // later steps fail gas estimation until this one is mined
    const { status } = await client.waitForTransactionReceipt({ hash });
    if (status === "reverted") throw new Error(`${hash} reverted`);
    steps[i] = { ...steps[i], state: "done" }; onStep([...steps]);
    hashes.push(hash);
  }
  return hashes;
}

export async function meta(vault: Address) {
  return getVaultMeta(client, vault);
}

export async function position(vault: Address, owner: Address) {
  const { asset, assetDecimals, shareDecimals } = await getVaultMeta(client, vault);
  const [{ shares, assets }, bal] = await Promise.all([
    readPosition(client, vault, asset, owner),
    client.readContract({ address: asset, abi: [{ type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ name: "a", type: "address" }], outputs: [{ type: "uint256" }] }] as const, functionName: "balanceOf", args: [owner] }),
  ]);
  return { shares: formatUnits(shares, shareDecimals), assets: formatUnits(assets, assetDecimals), wallet: formatUnits(bal, assetDecimals) };
}

export async function deposit(vault: Address, amount: string, owner: Address, eth: EIP1193Provider, onStep: (s: Step[]) => void) {
  const { assetDecimals } = await getVaultMeta(client, vault);
  return send(await planDeposit(client, vault, { assets: parseUnits(amount, assetDecimals), owner }), eth, onStep);
}

export async function withdrawAll(vault: Address, owner: Address, eth: EIP1193Provider, onStep: (s: Step[]) => void) {
  const { shareDecimals } = await getVaultMeta(client, vault);
  const { shares } = await position(vault, owner);
  return send(await planRedeem(client, vault, { shares: parseUnits(shares, shareDecimals), owner }), eth, onStep);
}
