import "server-only";
import { cookies } from "next/headers";
import { NET_COOKIE, netInfo, parseNet } from "@/lib/net";

export async function getNet() {
  return netInfo(parseNet((await cookies()).get(NET_COOKIE)?.value));
}
