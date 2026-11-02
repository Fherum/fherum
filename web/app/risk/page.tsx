import Link from "next/link";
import type { Metadata } from "next";
import { AUDITED, MAINNET_ENABLED } from "@/lib/protocol";

export const metadata: Metadata = { title: "Risk disclosure — FHERUM" };

const SECTIONS: [string, string][] = [
  ["Audit status", AUDITED
    ? "The deployed contracts have been audited. An audit reduces risk but does not remove it; read the published report before depositing."
    : "The FHERUM contracts are not audited. Do not deposit funds you cannot afford to lose."],
  ["Smart contract risk", "Bugs or unexpected interactions in the contracts, or in the tokens a market lists, can lead to partial or total loss of funds. Pause switches limit some actions but cannot reverse a loss."],
  ["Oracle risk", "Prices come from external feeds with staleness bounds. A wrong, stale or manipulated price can trigger liquidations or block actions."],
  ["Liquidation risk", "If your Health Factor (collateral × liquidation threshold ÷ debt) falls below 1.00, anyone can repay part of your debt and seize your collateral plus a bonus. Prices can move faster than you can react."],
  ["Interest rate and liquidity risk", "Rates are variable. When utilization is high you may be unable to withdraw supplied assets until borrowers repay."],
  ["Public positions", MAINNET_ENABLED
    ? "Mainnet runs in public mode with no FHE: your address, collateral, debt, Health Factor and every transaction are visible on-chain to anyone. FHE privacy mode is planned, not live."
    : "Positions are public: your address, collateral, debt, Health Factor and every transaction are visible on-chain. The testnet uses a simulated FHE adapter that performs no encryption."],
  ["Limited caps and governance", "Supply and borrow caps are kept low at launch. Risk parameters are set by a curator within hard bounds and change only through a timelock."],
  ["Testnet", "Testnet tokens are mocks with no value. Testnet behaviour does not guarantee mainnet behaviour."],
  ["No investment advice", "Nothing in this app is financial, investment, legal or tax advice. You are responsible for your own decisions and for complying with the laws that apply to you."],
];

export default function Risk() {
  return (
    <main className="min-h-dvh bg-bg text-ink px-5 md:px-8 py-16">
      <div className="max-w-2xl mx-auto">
        <Link href="/" className="font-mono text-xs uppercase text-ink-2 hover:text-bronze">← FHERUM</Link>
        <h1 className="mt-8 font-stencil uppercase text-5xl md:text-6xl leading-none">Risk disclosure</h1>
        <p className="mt-4 text-sm text-ink-2 leading-relaxed">Plain facts about using FHERUM. Read this before you supply, borrow or post collateral. The software is provided as is, without warranty.</p>
        <dl className="mt-10 border-t border-line">
          {SECTIONS.map(([k, v]) => (
            <div key={k} className="py-5 border-b border-line grid gap-2">
              <dt className="font-mono text-[11px] uppercase text-warn">{k}</dt>
              <dd className="text-sm text-ink-2 leading-relaxed">{v}</dd>
            </div>
          ))}
        </dl>
        <Link href="/app" className="mt-10 inline-block font-mono text-xs uppercase text-bronze hover:underline">Open the app →</Link>
      </div>
    </main>
  );
}
