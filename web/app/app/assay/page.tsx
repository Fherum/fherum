import { Suspense } from "react";
import Link from "next/link";
import { PageHead } from "@/components/shell";
import { Empty, Panel, Tag, Th } from "@/components/ui";
import { TokenLogo } from "@/components/token-logo";
import { getNet } from "@/lib/net-server";
import { NET_CONFIG, type NetKey } from "@/lib/protocol";
import { marketsFor, tryReadMarket } from "@/lib/chain";
import { assayRegistry, readAssay, type AssayState, type AssayView } from "@/lib/assay";

// ASSAY · dividend & corporate-action registry for stock collateral. Every live figure is a direct contract read
// (lib/assay.ts); the static copy mirrors src/AssayRegistry.sol and the OracleAdapter hook.
const ADMIN_SAFE = "0x3E7CEd699783751FBc7eb1545144DCe6C64D38CB";
const TIMELOCK = "0x47cB8ee6CfDd18dA1450AC3a85a3179583Eb61A7";
const PROOF: Partial<Record<NetKey, [string, string][]>> = {
  mainnet: [
    ["Registry deployed", "0xc07f0798879c406574942dc7d5f46b5e230a70c33826a2974351a86bb6db891f"],
    ["Safe 2-of-3 · register 12 stocks + attach hook (24 calls)", "0x619ef44b69fd2f8ae345d46ba4682346e9eebe1afa05c6839dfba0a7186b8d1a"],
    ["SPY record · dividend +0.1718%", "0x597a9f1f95e4e6d8f890d57d4454b8a5c7b24295de2e424a2f8a76de1bb0fdd5"],
    ["SPY market · borrow, isOpen() checked in-tx", "0xf6806dfb44ca7c38057712545d5f7f233c4d1ea1fc9e380778ae875ab0a9bad3"],
    ["SPY market · remove collateral, isOpen() checked", "0xc69ed28c0882f65831c3b74b07bdda3f0a612684886b4d8f4cef2edae1331549"],
  ],
};

const STATE: Record<AssayState, [string, "ok" | "warn" | "bad"]> = {
  NORMAL: ["Normal", "ok"],
  CORP_ACTION_PENDING: ["Corporate action scheduled", "warn"],
  CORP_ACTION_ACTIVE: ["Corporate action", "warn"],
  ISSUER_PAUSED: ["Issuer oracle pause", "warn"],
  UNEXPLAINED: ["Under review", "bad"],
};
const GATE: [string, boolean][] = [
  ["Supply", false], ["Withdraw", false], ["Add collateral", false], ["Repay", false],
  ["Borrow", true], ["Remove collateral", true], ["Liquidation", true],
];

const day = (s: number) => new Date(s * 1000).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
const p4 = (x: number) => `${x >= 0 ? "+" : ""}${x.toFixed(4)}%`;
const wad = (s: string) => (Number(BigInt(s) / BigInt(10) ** BigInt(6)) / 1e12).toFixed(6);
const short = (s: string) => `${s.slice(0, 6)}…${s.slice(-4)}`;

export default function AssayPage() {
  return (
    <>
      <PageHead eyebrow="Assay · Stock collateral integrity" title="Assay registry"
        aside={<Tag tone="bronze">Live on Robinhood Chain</Tag>}>
        Robinhood stock tokens reinvest dividends into the token itself through the ERC-8056 uiMultiplier. ASSAY reads
        every multiplier change onchain, classifies it as a dividend or a corporate action, and tells each FHERUM stock
        market whether risk actions are safe. Stock collateral keeps its dividend yield, read onchain.
      </PageHead>
      <div className="grid gap-4">
        <Panel title="How it works">
          <ol className="grid sm:grid-cols-2 lg:grid-cols-4">
            {[
              ["01 · Read", "The token's uiMultiplier() is read directly from the issuer contract. No offchain feed, no keeper trust."],
              ["02 · Classify", "A step up to 1% is a dividend reinvestment. Anything larger, or a decrease, is a corporate action or goes under review."],
              ["03 · Record", "record(token) is permissionless. Anyone can write the change onchain; the dividend index compounds per stock."],
              ["04 · Gate", "Each borrow and collateral withdrawal calls isOpen(token). A split or unexplained change pauses them. Repay never stops."],
            ].map(([t, d], i) => (
              <li key={t} className={`p-5 grid gap-2 content-start border-line ${i ? "border-l max-sm:border-l-0 max-sm:border-t" : ""}`}>
                <span className="font-mono text-xs uppercase text-bronze">{t}</span>
                <span className="text-sm text-ink-2">{d}</span>
              </li>
            ))}
          </ol>
        </Panel>

        <Suspense fallback={<Panel title="Tracked stock collateral"><p className="px-6 py-10 text-mute text-xs">Reading ASSAY registry and stock tokens from chain…</p></Panel>}>
          <Live />
        </Suspense>

        <div className="grid lg:grid-cols-2 gap-4">
          <Panel title="What ASSAY checks">
            <ul className="grid grid-cols-2 sm:grid-cols-4">
              {GATE.map(([a, gated], i) => (
                <li key={a} className={`p-4 grid gap-2 border-line border-t ${i % 4 ? "sm:border-l" : ""} ${i % 2 ? "max-sm:border-l" : ""}`}>
                  <span className="text-sm text-ink-2">{a}</span>
                  <span className={`font-mono text-[11px] ${gated ? "text-bronze" : "text-ok"}`}>{gated ? "◆ isOpen() check" : "● Always open"}</span>
                </li>
              ))}
            </ul>
            <p className="px-4 py-3 border-t border-line text-xs text-mute leading-relaxed">
              The check runs inside the user&apos;s own transaction: Market → OracleAdapter → ASSAY.isOpen(token). When a
              corporate action is in progress the call reverts with MarketClosed, so no one borrows against a mispriced split.
            </p>
          </Panel>
          <Panel title="Governance">
            <ul className="grid text-sm">
              {[
                ["Admin", "Safe 2-of-3", ADMIN_SAFE, "Registers stocks, resolves reviews, may only tighten parameters."],
                ["Parameters", "48h Timelock", TIMELOCK, "Loosening any threshold waits 48 hours in public, inside hard bounds."],
                ["Keeper", "Anyone", null, "record(token) is permissionless. isOpen also detects unrecorded changes live, so a dead keeper stays safe."],
              ].map(([k, who, addr, d]) => (
                <li key={k} className="px-4 py-3 border-b border-line last:border-0 grid gap-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-[10px] uppercase text-mute w-24">{k}</span>
                    <span className="text-ink">{who}</span>
                    {addr && <Addr a={addr} />}
                  </span>
                  <span className="text-xs text-ink-2">{d}</span>
                </li>
              ))}
            </ul>
          </Panel>
        </div>

        <Proof />

        <p className="text-xs text-mute leading-relaxed max-w-3xl">
          Figures are past onchain records, not projections. Dividends are reinvested into the token&apos;s uiMultiplier, not
          paid in cash. A corporate action pauses new borrows and collateral withdrawals; repay and add collateral always stay
          open. Not investment advice. Not affiliated with Robinhood.
        </p>
      </div>
    </>
  );
}

async function Addr({ a }: { a: string }) {
  const { net } = await getNet();
  const ex = NET_CONFIG[net].explorer?.replace(/\/$/, "");
  return ex
    ? <a href={`${ex}/address/${a}`} target="_blank" rel="noreferrer" className="font-mono text-xs hover:text-bronze underline decoration-line-2">{short(a)}</a>
    : <span className="font-mono text-xs text-mute">{short(a)}</span>;
}

async function Proof() {
  const { net } = await getNet();
  const reg = assayRegistry(net);
  const ex = NET_CONFIG[net].explorer?.replace(/\/$/, "");
  if (!reg || !ex) return null;
  return (
    <Panel title="Onchain proof">
      <ul className="grid text-sm">
        <li className="px-4 py-3 border-b border-line flex flex-wrap gap-x-4 gap-y-1">
          <span className="font-mono text-[10px] uppercase text-mute w-56 shrink-0">ASSAY registry contract</span>
          <a href={`${ex}/address/${reg}`} target="_blank" rel="noreferrer" className="font-mono text-xs break-all hover:text-bronze underline decoration-line-2">{reg}</a>
        </li>
        {(PROOF[net] ?? []).map(([k, tx]) => (
          <li key={tx} className="px-4 py-3 border-b border-line last:border-0 flex flex-wrap gap-x-4 gap-y-1">
            <span className="font-mono text-[10px] uppercase text-mute w-56 shrink-0">{k}</span>
            <a href={`${ex}/tx/${tx}`} target="_blank" rel="noreferrer" className="font-mono text-xs break-all hover:text-bronze underline decoration-line-2">{tx}</a>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

type Row = { market: string; symbol: string; a: AssayView };

async function Live() {
  const { net, live } = await getNet();
  if (!live || !assayRegistry(net)) return <Panel title="Tracked stock collateral"><Empty title="ASSAY is not deployed on this network.">Switch to Robinhood Chain mainnet to see the live registry.</Empty></Panel>;
  const reads = await Promise.all(marketsFor(net).map((a) => tryReadMarket(a, net)));
  const ms = reads.flatMap((r) => (r.ok ? [r.m] : []));
  const views: (AssayView | null | undefined)[] = [];
  // Bounded concurrency + one retry: twelve parallel registry reads trip public RPC rate limits.
  for (let i = 0; i < ms.length; i += 3) {
    const batch = await Promise.all(ms.slice(i, i + 3).map((m) =>
      readAssay(m.collateral.address, net).catch(() => readAssay(m.collateral.address, net)).catch(() => undefined)));
    views.push(...batch);
  }
  if (views.every((v) => v === undefined)) return <Panel title="Tracked stock collateral"><Empty title="Could not read the registry.">The RPC did not answer. Nothing is shown rather than guessed. Reload to retry.</Empty></Panel>;
  const rows: Row[] = ms.flatMap((m, i) => (views[i] ? [{ market: m.address, symbol: m.collateral.symbol, a: views[i]! }] : []))
    .sort((x, y) => y.a.upliftPct - x.a.upliftPct);
  const ex = NET_CONFIG[net].explorer?.replace(/\/$/, "") ?? null;
  const open = rows.filter((r) => r.a.open).length;
  const divs = rows.reduce((n, r) => n + r.a.entries.filter((e) => e.cls === "DIVIDEND").length, 0);
  const paying = rows.filter((r) => r.a.upliftPct > 0).length;
  const failed = reads.length - ms.length + views.filter((v) => v === undefined).length;
  const top = rows[0];

  return (
    <>
      <div className="grid grid-cols-2 lg:grid-cols-4 border border-line bg-s1">
        {([
          ["Stocks tracked", String(rows.length), "registered in ASSAY"],
          ["Risk actions open", `${open} / ${rows.length}`, "isOpen(token) = true"],
          ["Dividends recorded", String(divs), `${paying} stocks with uplift`],
          ["Highest uplift", top ? p4(top.a.upliftPct) : "—", top ? `${top.symbol} · since registry baseline` : ""],
        ] as [string, string, string][]).map(([k, v, s], i) => (
          <div key={k} className={`p-5 border-line ${i ? "border-l" : ""} ${i === 2 ? "max-lg:border-l-0 max-lg:border-t" : ""} ${i === 3 ? "max-lg:border-t" : ""}`}>
            <div className="eyebrow mb-3">{k}</div>
            <div className="num font-mono text-2xl text-ink">{v}</div>
            <div className="font-mono text-[10px] text-mute mt-2">{s}</div>
          </div>
        ))}
      </div>
      <Panel title="Tracked stock collateral" aside={<span className="font-mono text-[10px] uppercase text-mute">{failed ? `${failed} unread · reload · ` : ""}Read {new Date().toISOString().slice(11, 16)} UTC</span>}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-sm">
            <thead className="border-b border-line"><tr>
              <Th>Stock</Th><Th>State</Th><Th>Risk actions</Th><Th right>Dividend uplift</Th><Th right>uiMultiplier</Th><Th>Last record</Th><Th>Market</Th>
            </tr></thead>
            <tbody>
              {rows.map(({ market, symbol, a }) => {
                const [label, tone] = STATE[a.state];
                const last = a.entries[0];
                return (
                  <tr key={market} className="border-b border-line last:border-0">
                    <td className="px-4 py-3"><span className="flex items-center gap-2"><TokenLogo symbol={symbol} size={20} /><span className="text-ink">{symbol}</span></span></td>
                    <td className="px-4 py-3"><Tag tone={tone}>{label}</Tag></td>
                    <td className="px-4 py-3"><Tag tone={a.open ? "ok" : "warn"}>{a.open ? "Open" : "Paused · repay open"}</Tag></td>
                    <td className={`px-4 py-3 text-right num font-mono ${a.upliftPct > 0 ? "text-ok" : "text-mute"}`}>{p4(a.upliftPct)}</td>
                    <td className="px-4 py-3 text-right num font-mono text-ink-2">{wad(a.tokenMultiplier)}</td>
                    <td className="px-4 py-3 font-mono text-xs whitespace-nowrap">{last
                      ? last.tx && ex
                        ? <a href={`${ex}/tx/${last.tx}`} target="_blank" rel="noreferrer" className="hover:text-bronze underline decoration-line-2">{day(last.recordedAt)} · {short(last.tx)}</a>
                        : <span className="text-ink-2">{day(last.recordedAt)}</span>
                      : <span className="text-mute">No change yet</span>}</td>
                    <td className="px-4 py-3"><Link href={`/app/markets/${market}`} className="font-mono text-xs uppercase hover:text-bronze">{symbol} / USDG →</Link></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>
    </>
  );
}
