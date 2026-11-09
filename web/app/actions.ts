"use server";

import type { Address } from "viem";
import type { NetKey } from "@/lib/protocol";
import { invalidateActivity } from "@/lib/activity";
import { invalidateHistory } from "@/lib/history";
import { invalidateCurator } from "@/lib/curator";

/** After a confirmed tx: drop server caches so Activity + chart re-read the chain on the next render. */
export async function txConfirmed(net: NetKey, market: Address) {
  if (net !== "mainnet" && net !== "testnet") return;
  if (!/^0x[0-9a-fA-F]{40}$/.test(market)) return;
  invalidateActivity(net, market);
  invalidateHistory(net, market);
}

/** After a confirmed curator tx: re-scan the registry on the next render. */
export async function curatorConfirmed(net: NetKey) {
  if (net !== "mainnet" && net !== "testnet") return;
  invalidateCurator(net);
}
