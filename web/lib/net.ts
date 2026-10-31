// Which network the app is pointed at. Chosen by the header dropdown, stored in a cookie
// so server pages read the same network the client shows.
import { CHAINS, isDeployed } from "@/lib/protocol";

export type Net = keyof typeof CHAINS;
export const NET_COOKIE = "fherum.network";
// Network switching is disabled until mainnet ships: always testnet (old "mainnet" cookies are ignored).
export const parseNet = (v?: string | null): Net => (void v, "testnet");

/** live = contracts configured for this network. Only testnet has a deployment today. */
export const netInfo = (net: Net) => ({ net, chain: CHAINS[net], live: net === "testnet" && isDeployed() });
export type NetInfo = ReturnType<typeof netInfo>;
