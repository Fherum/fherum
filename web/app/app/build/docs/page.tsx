import Link from "next/link";
import { PageHead } from "@/components/shell";
import { Panel, Tag } from "@/components/ui";
import { CopyButton } from "@/components/copy-button";

const REPO = "https://github.com/Fherum/fherum/tree/main/packages/headless";
const MARKET = "0xa4eE12E6f0C998B7Cc2F7Cc7724B2598Cb9370D7";

const EMBED = `<iframe
  src="https://fherum.tech/embed/${MARKET}?brand=Your%20App&accent=3dd68c"
  width="400" height="680" style="border:0"></iframe>`;

const READ = `import { createHeadless } from "./fherum-headless/index.ts";

const fherum = createHeadless();            // public RPC, no API key
const markets = await fherum.listMarkets(); // 16 USDG markets
const pos = await fherum.getPosition(markets[0].address, user);`;

const WRITE = `import { tx, FHERUM } from "./fherum-headless/index.ts";

const [, market] = FHERUM.markets[0];        // WETH/USDG
const approve = await fherum.approvalIfNeeded(FHERUM.tokens.USDG, user, market, 1_000_000n);
const supply = tx.supply(market, 1_000_000n); // 1 USDG (6 decimals)

if (approve) await wallet.sendTransaction(approve);
await wallet.sendTransaction(supply);       // your user signs; FHERUM never holds keys`;

const PARAMS: [string, string][] = [
  ["brand", "Name shown in the widget header, up to 24 characters."],
  ["accent", "Hex color without #, e.g. 3dd68c."],
  ["mode", "earn (Supply, Withdraw) or borrow (Collateral, Remove, Borrow, Repay). Default earn."],
];

const API: [string, string][] = [
  ["listMarkets()", "All markets with supply/borrow APY, utilization, liquidity, LTV, caps, pause flags."],
  ["getMarket(addr)", "One market."],
  ["getPosition(market, user)", "Supplied, collateral, debt, health factor."],
  ["approvalIfNeeded(asset, owner, spender, amt)", "Approve tx, or null if allowance is enough."],
  ["tx.supply / withdraw", "Lend or pull the loan asset (USDG)."],
  ["tx.addCollateral / removeCollateral", "Post or remove collateral."],
  ["tx.borrow / repay", "Borrow USDG against collateral, repay debt."],
  ["tx.hearth.createAccount / applyStack", "Agent vault with a HEARTH Hooks rule stack."],
];

function Code({ code }: { code: string }) {
  return (
    <div className="relative">
      <div className="absolute right-3 top-3"><CopyButton text={code} /></div>
      <pre className="p-5 pr-32 overflow-x-auto font-mono text-[12px] leading-relaxed text-ink-2">{code}</pre>
    </div>
  );
}

export default function BuildDocsPage() {
  return (
    <>
      <PageHead
        eyebrow="Build · Docs"
        title="Headless Lending docs"
      >
        Two ways to put FHERUM lending inside your product: drop in the widget, or build your own UI with the SDK.
      </PageHead>
      <div className="grid gap-4">
        <Panel title="Option A · Widget" aside={<Tag tone="ok">Fastest · 1 line</Tag>}>
          <p className="px-5 pt-5 text-sm text-ink-2">Paste this iframe into any page. Users connect their own wallet and transact on Robinhood Chain mainnet.</p>
          <Code code={EMBED} />
          <table className="w-full text-sm border-t border-line">
            <tbody>
              {PARAMS.map(([k, v]) => (
                <tr key={k} className="border-b border-line last:border-0">
                  <td className="px-5 py-2 font-mono text-xs text-ink w-32">{k}</td>
                  <td className="px-5 py-2 text-ink-2">{v}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>

        <Panel title="Option B · SDK" aside={<a href={REPO} target="_blank" rel="noreferrer" className="font-mono text-[11px] text-bronze hover:underline">@fherum/headless on GitHub ↗</a>}>
          <p className="px-5 pt-5 text-sm text-ink-2">Copy <span className="font-mono">packages/headless/src</span> from the repo. Only dependency: viem. Not on npm yet.</p>
          <p className="px-5 pt-4 font-mono text-[11px] uppercase text-mute">1 · Read markets</p>
          <Code code={READ} />
          <p className="px-5 font-mono text-[11px] uppercase text-mute">2 · Build a transaction</p>
          <Code code={WRITE} />
        </Panel>

        <Panel title="SDK reference">
          <table className="w-full text-sm">
            <tbody>
              {API.map(([k, v]) => (
                <tr key={k} className="border-b border-line last:border-0">
                  <td className="px-5 py-2 font-mono text-xs text-ink whitespace-nowrap">{k}</td>
                  <td className="px-5 py-2 text-ink-2">{v}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>

        <Panel title="Good to know">
          <ul className="p-5 grid gap-2 text-sm text-ink-2 list-disc pl-10">
            <li>Mainnet only (Robinhood Chain, 4663). Loan asset is USDG for every market.</li>
            <li>The SDK never signs or sends. It returns <span className="font-mono">{"{ to, data, value }"}</span> for your user&apos;s wallet.</li>
            <li>Amounts are raw token units (USDG has 6 decimals). Rates are fractions: 0.0425 = 4.25%.</li>
            <li>Public mode: positions are visible on-chain. Not audited, caps limited.</li>
          </ul>
        </Panel>

        <Link href="/app/build" className="font-mono text-xs text-bronze hover:underline">← Back to Build</Link>
      </div>
    </>
  );
}
