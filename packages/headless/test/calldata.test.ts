// Calldata must equal `cast calldata` output for the same signature + args (values pasted from cast).
import assert from "node:assert/strict";
import { tx } from "../src/index.ts";

const M = "0xa4eE12E6f0C998B7Cc2F7Cc7724B2598Cb9370D7";
const U = "0x84811fa225461c24285E16F331Ec942ac9a1C199";
const W = (n: number | string) => BigInt(n).toString(16).padStart(64, "0");
const cases: [string, { to: string; data: string }, string, string][] = [
  ["supply", tx.supply(M, 1_000_000n), M, "0x35403023" + W(1_000_000)],
  ["withdraw", tx.withdraw(M, 1_000_000n), M, "0x2e1a7d4d" + W(1_000_000)],
  ["borrow", tx.borrow(M, 1n), M, "0xc5ebeaec" + W(1)],
  ["repay", tx.repay(M, U, 1n), M, "0x22867d78" + U.slice(2).toLowerCase().padStart(64, "0") + W(1)],
  ["applyStack", tx.hearth.applyStack(U, `0x${W(1)}`), "0x15619a79ea3A3128D56B4FDFa11b7F46D3D67Fc3", "0xd96247d6" + U.slice(2).toLowerCase().padStart(64, "0") + W(1)],
];
for (const [n, t, to, data] of cases) {
  assert.equal(t.data, data, n);
  assert.equal(t.to, to, `${n} to`);
}
console.log(`ok ${cases.length} calldata cases match cast`);
