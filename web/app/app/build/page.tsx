import { CopyButton } from "@/components/copy-button";
import { Suspense } from "react";
import Link from "next/link";
import { PageHead } from "@/components/shell";
import { Panel, Tag } from "@/components/ui";
import { BuildSandbox, type SandboxMarket } from "@/components/build-sandbox";
import { getNet } from "@/lib/net-server";
import { amt, marketsFor, pct, tryReadMarket } from "@/lib/chain";
import { DEPLOYMENTS } from "@/lib/deployments";
import { NET_CONFIG } from "@/lib/protocol";
import type { Net } from "@/lib/net";

const EX = "https://robinhoodchain.blockscout.com";
const short = (s: string) => `${s.slice(0, 6)}…${s.slice(-4)}`;

const FLOW = [
  ["01", "Your app or platform", "Trading app, vault, wallet or AI agent. You own the UX and the users."],
  ["02", "FHERUM Headless Lending", "Markets, rates, risk, oracles, liquidation and execution. Live contracts."],
  ["03", "Robinhood Chain settlement", "Every supply, borrow and repay settles on-chain on 4663."],
  ["04", "Your lending market", "A branded lending experience, powered by FHERUM underneath."],
] as const;

const MODULES: { title: string; line: string; contracts: string[] }[] = [
  { title: "Modular", line: "Pick the parts you need: isolated markets, shared hub liquidity, oracles, read lens, agent hooks.", contracts: ["LiquidityHub", "MarketFactory", "LensReader", "OracleAdapter"] },
  { title: "Configurable", line: "Markets carry their own LTV, liquidation threshold and caps. Per-user rules ride on HEARTH Hooks stacks.", contracts: ["CuratorRegistry", "TimelockController", "RiskEngine"] },
  { title: "Integration-ready", line: "Permissionless contracts and a read-only lens. Call them from any frontend, backend or agent.", contracts: ["LensReader", "EmergencyController"] },
  { title: "Open by default", line: "No API key, no allowlist to read or integrate. Anyone can build a lending front on FHERUM.", contracts: ["LiquidityHub"] },
];

export default async function BuildPage() {
  const { net, live } = await getNet();
  const lens = NET_CONFIG.mainnet.lensReader ?? "0x…";
  const market = marketsFor("mainnet")[0] ?? "0x…";
  const byName = new Map(DEPLOYMENTS.mainnet.contracts.map((c) => [c.name, c.address]));
  const embedCode = `<iframe
  src="https://fherum.tech/embed/${market}?brand=Acme%20Earn&accent=3dd68c"
  width="380" height="640" style="border:0"
  allow="clipboard-write"></iframe>`;
  const snippet = `import { createPublicClient, http, parseAbi } from "viem";

const client = createPublicClient({ transport: http("https://robinhood.daybreak-rpc.network") });
const lens = parseAbi([
  "function snapshot(address) view returns ((uint256 totalSupplyAssets,uint256 totalDebtAssets,uint256,uint256,uint256,uint256 availableLiquidity,uint256 utilizationWad,uint256 borrowRatePerYearWad,uint256 supplyRatePerYearWad,uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256,bool,bool,bool,bool,bool,uint8,address))",
]);

// FHERUM WETH/USDG market, read through LensReader on Robinhood Chain (4663)
const s = await client.readContract({
  address: "${lens}", abi: lens, functionName: "snapshot",
  args: ["${market}"],
});
console.log("supply APY", Number(s.supplyRatePerYearWad) / 1e16, "%");`;

  return (
    <>
      <PageHead eyebrow="Headless Lending · builder console" title="Build on FHERUM"
        aside={<Tag tone="bronze">Robinhood Chain · 4663</Tag>}>
        FHERUM is the lending engine, without the frontend. Apps build their own lending experience on FHERUM&apos;s markets,
        risk and settlement instead of building a lending protocol from scratch. Headless architecture, inspired by ATLAS.
      </PageHead>

      <div className="grid gap-4">
        <Panel title="How it works">
          <ol className="grid md:grid-cols-2 xl:grid-cols-4">
            {FLOW.map(([k, t, d], i) => (
              <li key={k} className={`p-5 grid gap-2 content-start border-line ${i ? "max-md:border-t md:border-l" : ""} ${i === 2 ? "md:max-xl:border-l-0 md:max-xl:border-t" : ""} ${i === 3 ? "md:max-xl:border-t" : ""}`}>
                <span className="font-mono text-xs text-bronze">{k} {i < 3 ? "→" : "■"}</span>
                <span className="font-mono text-sm uppercase text-ink">{t}</span>
                <span className="text-sm text-ink-2">{d}</span>
              </li>
            ))}
          </ol>
        </Panel>

        <Suspense fallback={<Panel title="Engine · live"><p className="p-5 font-mono text-xs text-mute">Reading markets from chain…</p></Panel>}>
          <EngineStats net={net} live={live} />
        </Suspense>

        <Panel title="Modules">
          <ul className="grid md:grid-cols-2">
            {MODULES.map((m, i) => (
              <li key={m.title} className={`p-5 grid gap-3 content-start border-line ${i ? "max-md:border-t" : ""} ${i % 2 ? "md:border-l" : ""} ${i > 1 ? "md:border-t" : ""}`}>
                <div className="flex items-center justify-between">
                  <span className="font-mono text-sm uppercase text-ink">{m.title}</span>
                  <Tag tone="ok">Live</Tag>
                </div>
                <p className="text-sm text-ink-2">{m.line}</p>
                <div className="flex flex-wrap gap-x-4 gap-y-1">
                  {m.contracts.map((c) => {
                    const a = byName.get(c);
                    return a ? (
                      <a key={c} href={`${EX}/address/${a}`} target="_blank" rel="noreferrer" className="font-mono text-[11px] text-mute underline hover:text-ink">
                        {c} {short(a)} ↗
                      </a>
                    ) : null;
                  })}
                </div>
              </li>
            ))}
          </ul>
        </Panel>

        <Panel title="Your lending market · sandbox" aside={<Tag tone="warn">Preview</Tag>}>
          <Suspense fallback={<p className="p-5 font-mono text-xs text-mute">Loading live market data…</p>}>
            <Sandbox net={net} live={live} />
          </Suspense>
        </Panel>

        <Panel title="Quickstart · read a market in 10 lines" aside={<span className="font-mono text-[11px] text-mute">viem · no API key</span>}>
          <pre className="p-5 overflow-x-auto font-mono text-[12px] leading-relaxed text-ink-2">{snippet}</pre>
          <p className="px-5 py-3 border-t border-line text-xs text-mute">
            Works today against mainnet. Read helpers and tx builders ship as{" "}
            <a href="https://github.com/Fherum/fherum/tree/main/packages/headless" target="_blank" rel="noreferrer" className="font-mono text-bronze hover:underline">@fherum/headless ↗</a>.
            {" "}<Link href="/app/markets" className="text-bronze hover:underline">See the reference frontend →</Link>
          </p>
        </Panel>

        <Panel title="Embed · drop-in widget" aside={<span className="font-mono text-[11px] text-mute">real tx · user's own wallet</span>}>
          <div className="grid lg:grid-cols-[1fr_380px]">
            <div className="p-5 grid gap-3 content-start">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm text-ink">Paste this into your site. The live widget on the right is what your users get.</p>
                <CopyButton text={embedCode} />
              </div>
              <pre className="overflow-x-auto font-mono text-[12px] leading-relaxed text-ink-2">{embedCode}</pre>
              <p className="text-xs text-mute">Params: <span className="font-mono">brand</span> (24 chars), <span className="font-mono">accent</span> (hex), <span className="font-mono">mode=earn|borrow</span>. Mainnet only. Every action is signed in the visitor&apos;s wallet; FHERUM never holds keys.</p>
            </div>
            <iframe src={`/embed/${market}?brand=Acme%20Earn&accent=3dd68c`} title="FHERUM embed preview" className="w-full h-[640px] border-l border-line" />
          </div>
        </Panel>

        <p className="text-xs text-mute">Public mode: positions are visible on-chain. Not audited, caps limited. New markets go through the curator and a 48h timelock.</p>
      </div>
    </>
  );
}

async function reads(net: Net, live: boolean) {
  const addrs = live ? marketsFor(net) : [];
  const rs = await Promise.all(addrs.map((a) => tryReadMarket(a, net)));
  return rs.flatMap((r) => (r.ok ? [r.m] : []));
}

async function EngineStats({ net, live }: { net: Net; live: boolean }) {
  const ms = await reads(net, live);
  const dec = ms[0]?.loan.decimals ?? 6;
  const sum = (k: "totalSupplyAssets" | "totalDebtAssets" | "availableLiquidity") => ms.reduce((s, m) => s + m.snap[k], BigInt(0));
  const cells = [
    ["Markets", String(ms.length), "isolated spokes, one hub"],
    ["Supplied", `${amt(sum("totalSupplyAssets"), dec)} USDG`, "across all markets"],
    ["Borrowed", `${amt(sum("totalDebtAssets"), dec)} USDG`, "outstanding debt"],
    ["Available", `${amt(sum("availableLiquidity"), dec)} USDG`, "withdrawable liquidity"],
  ];
  return (
    <Panel title="Engine · live" aside={<Tag tone={ms.length ? "ok" : "warn"}>{ms.length ? "Read from chain" : "Unavailable"}</Tag>}>
      <div className="grid grid-cols-2 lg:grid-cols-4">
        {cells.map(([k, v, s], i) => (
          <div key={k} className={`p-5 border-line ${i % 2 ? "border-l" : ""} ${i > 1 ? "max-lg:border-t" : ""} ${i === 2 ? "lg:border-l" : ""}`}>
            <div className="eyebrow mb-3">{k}</div>
            <div className="num font-mono text-2xl text-ink">{v}</div>
            <div className="font-mono text-[10px] text-mute mt-2">{s}</div>
          </div>
        ))}
      </div>
    </Panel>
  );
}

async function Sandbox({ net, live }: { net: Net; live: boolean }) {
  const ms = await reads(net, live);
  const data: SandboxMarket[] = ms.map((m) => ({
    pair: `${m.collateral.symbol}/${m.loan.symbol}`,
    address: m.address,
    supplyApy: pct(m.snap.supplyRatePerYearWad),
    util: pct(m.snap.utilizationWad),
    liquidity: amt(m.snap.availableLiquidity, m.loan.decimals),
    loan: m.loan.symbol,
  }));
  return <BuildSandbox markets={data} />;
}
