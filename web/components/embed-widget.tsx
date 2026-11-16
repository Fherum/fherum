"use client";

import type { CSSProperties } from "react";
import { ActionPanel, type PanelMarket } from "@/components/action-panel";
import { NetworkProvider } from "@/components/network-context";
import { WalletButton, WalletProvider } from "@/components/wallet";

type Stats = { pair: string; supplyApy: string; borrowApy: string; util: string; liquidity: string };

/** Self-contained lending widget for iframes: own wallet + network context, pinned to mainnet. */
export function EmbedWidget({ market, accent, brand, mode, stats }: {
  market: PanelMarket; accent: string | null; brand: string | null; mode: "earn" | "borrow"; stats: Stats;
}) {
  const style = accent ? ({ "--bronze": accent } as CSSProperties) : undefined;
  return (
    <NetworkProvider initial="mainnet">
      <WalletProvider>
        <div style={style} className="min-h-dvh bg-bg p-3 grid gap-3 content-start">
          <header className="flex items-center justify-between gap-3 border-b border-line pb-3" style={{ borderTop: "3px solid var(--bronze)" }}>
            <div className="pt-2">
              <div className="font-mono text-sm text-ink">{brand ?? "FHERUM"} · {stats.pair}</div>
              <div className="font-mono text-[10px] uppercase text-mute">Robinhood Chain · live market</div>
            </div>
            <WalletButton />
          </header>
          <div className="grid grid-cols-3 gap-2 font-mono text-xs">
            <Cell k={mode === "earn" ? "Supply APY" : "Borrow APY"} v={mode === "earn" ? stats.supplyApy : stats.borrowApy} />
            <Cell k="Utilization" v={stats.util} />
            <Cell k="Available" v={stats.liquidity} />
          </div>
          <ActionPanel market={market} only={mode === "earn" ? ["Supply", "Withdraw"] : ["Collateral", "Remove", "Borrow", "Repay"]} />
          <a href={`https://fherum.tech/app/markets/${market.address}`} target="_blank" rel="noreferrer"
            className="font-mono text-[10px] uppercase text-mute text-center hover:text-ink">
            Powered by FHERUM · headless lending ↗
          </a>
          <p className="text-[10px] text-mute text-center">Public mode: positions are visible on-chain. Not audited, caps limited.</p>
        </div>
      </WalletProvider>
    </NetworkProvider>
  );
}

function Cell({ k, v }: { k: string; v: string }) {
  return (
    <div className="border border-line p-2 min-w-0">
      <div className="text-mute text-[10px] uppercase">{k}</div>
      <div className="num text-ink truncate">{v}</div>
    </div>
  );
}
