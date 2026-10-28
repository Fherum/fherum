"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";

import { NetworkSwitch, WalletButton, WalletProvider } from "@/components/wallet";
import { NetworkProvider, useNet } from "@/components/network-context";
import type { Net } from "@/lib/net";

const NAV = [
  { href: "/app", label: "Overview", k: "01" },
  { href: "/app/markets", label: "Markets", k: "02" },
  { href: "/app/position", label: "Position", k: "03" },
  { href: "/app/lens", label: "Steel Lens", k: "04" },
  { href: "/app/curator", label: "Curator", k: "05" },
  { href: "/app/activity", label: "Activity", k: "06" },
  { href: "/app/settings", label: "Settings", k: "07" },
];

export function AppShell({ children, net }: { children: ReactNode; net: Net }) {
  return <NetworkProvider initial={net}><Shell>{children}</Shell></NetworkProvider>;
}

function LiveNote() {
  const { live, chain } = useNet();
  return <>{live ? `Reading LensReader · ${chain.name}` : `${chain.name}: not deployed — nothing below is live data`}</>;
}

function Shell({ children }: { children: ReactNode }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const active = (h: string) => (h === "/app" ? path === "/app" : path.startsWith(h));

  return (
    <WalletProvider>
      <div className="min-h-dvh grid lg:grid-cols-[232px_1fr]">
        <aside className={`${open ? "fixed inset-0 z-40" : "hidden"} lg:sticky lg:top-0 lg:h-dvh lg:block border-r border-line bg-s1 text-ink overflow-y-auto`}>
          <div className="h-16 px-5 flex items-center justify-between border-b border-line">
            <Link href="/" className="font-stencil text-xl tracking-[0.12em]">FHERUM</Link>
            <button className="lg:hidden font-mono text-xs uppercase" onClick={() => setOpen(false)}>Close</button>
          </div>
          <nav className="p-3 grid gap-0.5" aria-label="App">
            {NAV.map((n) => (
              <Link key={n.href} href={n.href} onClick={() => setOpen(false)}
                aria-current={active(n.href) ? "page" : undefined}
                className={`relative h-10 px-3 flex items-center gap-3 text-sm transition-colors border-l-2 ${
                  active(n.href) ? "border-bronze bg-s2 text-ink font-medium" : "border-transparent text-ink-2 hover:text-ink hover:bg-s2/60"}`}>
                {n.label}
              </Link>
            ))}
          </nav>
          <div className="mx-3 mt-6 mb-6 border border-warn/40 p-3 grid gap-1.5">
            <p className="font-mono text-[10px] uppercase text-warn">▲ Privacy mode · Public</p>
            <p className="text-xs leading-relaxed text-ink-2">No FHE provider serves this chain yet. Amounts you enter are visible on chain.</p>
          </div>
        </aside>

        <div className="min-w-0 flex flex-col">
          <header className="sticky top-0 z-30 h-16 border-b border-line bg-bg/90 backdrop-blur px-4 md:px-6 flex items-center gap-3">
            <button className="lg:hidden h-9 px-3 border-2 border-ink font-mono text-xs uppercase" onClick={() => setOpen(true)} aria-label="Open navigation">Menu</button>
            <span className="hidden md:inline font-mono text-[11px] text-mute">
              <LiveNote />
            </span>
            <div className="ml-auto flex items-center gap-3"><NetworkSwitch /><WalletButton /></div>
          </header>
          <main className="relative flex-1 p-4 md:p-6 lg:p-10">
            <div className="relative max-w-[1280px]">{children}</div>
          </main>
        </div>
      </div>
    </WalletProvider>
  );
}

export function PageHead({ eyebrow, title, children, aside }: { eyebrow: string; title: string; children?: ReactNode; aside?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4 mb-8">
      <div>
        <p className="font-mono text-[11px] uppercase text-mute mb-2">{eyebrow}</p>
        <h1 className="font-stencil uppercase text-4xl md:text-5xl leading-none tracking-wide">{title}</h1>
        {children && <p className="mt-3 text-sm text-ink-2 max-w-2xl leading-relaxed pretty">{children}</p>}
      </div>
      {aside}
    </div>
  );
}
