"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { Wordmark } from "@/components/brand";
import { WalletButton, WalletProvider, useWallet } from "@/components/wallet";
import { TARGET_CHAIN, isDeployed } from "@/lib/protocol";

const NAV = [
  { href: "/app", label: "Overview", k: "01" },
  { href: "/app/markets", label: "Markets", k: "02" },
  { href: "/app/position", label: "Position", k: "03" },
  { href: "/app/lens", label: "Steel Lens", k: "04" },
  { href: "/app/curator", label: "Curator", k: "05" },
  { href: "/app/activity", label: "Activity", k: "06" },
  { href: "/app/settings", label: "Settings", k: "07" },
];

function NetBadge() {
  const { w } = useWallet();
  const wrong = w.status === "connected" && w.chainId !== TARGET_CHAIN.id;
  return (
    <span className={`h-7 px-2.5 border font-mono text-[11px] inline-flex items-center gap-1.5 ${wrong ? "border-warn/50 text-warn" : "border-line-2 text-ink-2"}`}>
      <span aria-hidden className="text-[8px] text-warn">▲</span>
      TESTNET · {TARGET_CHAIN.id}
    </span>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const active = (h: string) => (h === "/app" ? path === "/app" : path.startsWith(h));

  return (
    <WalletProvider>
      <div className="min-h-dvh grid lg:grid-cols-[232px_1fr]">
        <aside className={`${open ? "fixed inset-0 z-40 bg-bg" : "hidden"} lg:static lg:block border-r border-line bg-s1`}>
          <div className="h-14 px-5 flex items-center justify-between border-b border-line">
            <Wordmark href="/" />
            <button className="lg:hidden text-mute text-sm" onClick={() => setOpen(false)}>Close</button>
          </div>
          <nav className="p-3 grid gap-px" aria-label="App">
            {NAV.map((n) => (
              <Link key={n.href} href={n.href} onClick={() => setOpen(false)}
                aria-current={active(n.href) ? "page" : undefined}
                className={`relative h-10 px-3 flex items-center gap-3 text-sm transition-colors ${
                  active(n.href) ? "bg-s3 text-ink" : "text-ink-2 hover:text-ink hover:bg-s2"}`}>
                {active(n.href) && <span aria-hidden className="absolute left-0 top-2 bottom-2 w-px bg-bronze" />}
                <span className="font-mono text-[10px] text-mute">{n.k}</span>{n.label}
              </Link>
            ))}
          </nav>
          <div className="mx-3 mt-6 border border-line p-3 grid gap-2">
            <p className="eyebrow">Privacy mode</p>
            <p className="text-sm text-ink">Public</p>
            <p className="text-xs text-mute leading-relaxed">No FHE provider serves this chain yet. Amounts you enter are visible on chain.</p>
          </div>
        </aside>

        <div className="min-w-0 flex flex-col">
          <header className="sticky top-0 z-30 h-14 border-b border-line bg-bg/90 backdrop-blur-sm px-4 md:px-6 flex items-center gap-3">
            <button className="lg:hidden h-9 px-3 border border-line text-sm" onClick={() => setOpen(true)} aria-label="Open navigation">Menu</button>
            <NetBadge />
            <span className="hidden md:inline font-mono text-[11px] text-mute">
              {isDeployed() ? "Reading LensReader" : "No deployment configured — nothing below is live data"}
            </span>
            <div className="ml-auto"><WalletButton /></div>
          </header>
          <main className="flex-1 p-4 md:p-6 lg:p-8">{children}</main>
        </div>
      </div>
    </WalletProvider>
  );
}

export function PageHead({ eyebrow, title, children, aside }: { eyebrow: string; title: string; children?: ReactNode; aside?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4 mb-8">
      <div>
        <p className="eyebrow mb-3">{eyebrow}</p>
        <h1 className="font-display text-4xl md:text-5xl leading-none">{title}</h1>
        {children && <p className="mt-4 text-sm text-mute max-w-2xl leading-relaxed pretty">{children}</p>}
      </div>
      {aside}
    </div>
  );
}
