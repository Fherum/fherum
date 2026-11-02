// Which network the app is pointed at. Chosen by the header dropdown, stored in a cookie
// so server pages read the same network the client shows.
import { CHAINS, ENABLED_NETS, isDeployed } from "@/lib/protocol";

export type Net = keyof typeof CHAINS;
export const NET_COOKIE = "fherum.network";
// Mainnet is accepted only when its deployment env is configured (MAINNET_ENABLED); otherwise always testnet.
export const parseNet = (v?: string | null): Net => (ENABLED_NETS as string[]).includes(v ?? "") ? (v as Net) : "testnet";

/** live = contracts configured for this network. mainnet = public mode, no FHE (positions visible). */
export const netInfo = (net: Net) => ({ net, chain: CHAINS[net], live: isDeployed(net), mainnet: net === "mainnet" });
export type NetInfo = ReturnType<typeof netInfo>;
