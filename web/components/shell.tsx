"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";

import { WalletButton, WalletProvider, useWallet } from "@/components/wallet";
import { TARGET_CHAIN, isDeployed } from "@/lib/protocol";
import { GlyphField } from "@/components/fx/glyph-field";

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
    <span className={`h-8 px-2.5 border-2 font-mono text-[11px] inline-flex items-center gap-1.5 ${wrong ? "border-warn/50 text-warn" : "border-line-2 text-ink-2"}`}>
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
        <aside className={`${open ? "fixed inset-0 z-40" : "hidden"} lg:sticky lg:top-0 lg:h-dvh lg:block border-r-2 border-ink bg-[#ff5a1f] text-[#120c08] overflow-y-auto`}>
          <div className="h-16 px-5 flex items-center justify-between border-b-2 border-[#120c08]">
            <Link href="/" className="font-stencil text-2xl tracking-[0.12em]">FHERUM</Link>
            <button className="lg:hidden font-mono text-xs uppercase" onClick={() => setOpen(false)}>Close</button>
          </div>
          <nav className="p-3 grid gap-px" aria-label="App">
            {NAV.map((n) => (
              <Link key={n.href} href={n.href} onClick={() => setOpen(false)}
                aria-current={active(n.href) ? "page" : undefined}
                className={`group relative h-12 px-3 flex items-center gap-3 font-stencil uppercase text-2xl tracking-wide transition-all ${
                  active(n.href) ? "bg-[#120c08] text-[#e9e4d8] translate-x-1 shadow-[4px_4px_0_#e9e4d8]" : "hover:bg-[#120c08]/10 hover:translate-x-1"}`}>
                <span className="font-mono text-[10px] opacity-60">{n.k}</span>{n.label}
                {active(n.href) && <span aria-hidden className="ml-auto font-mono text-xs">◆</span>}
              </Link>
            ))}
          </nav>
          <div className="mx-3 mt-6 mb-6 border-2 border-[#120c08] bg-[#e9e4d8] p-3 grid gap-2 shadow-[5px_5px_0_#120c08]">
            <p className="font-mono text-[10px] uppercase">Privacy mode</p>
            <p className="font-stencil text-3xl uppercase leading-none">Public</p>
            <p className="text-xs leading-relaxed text-[#3a2e24]">No FHE provider serves this chain yet. Amounts you enter are visible on chain.</p>
          </div>
        </aside>

        <div className="min-w-0 flex flex-col">
          <div className="heatbar h-1" aria-hidden />
          <header className="sticky top-0 z-30 h-16 border-b-2 border-ink bg-bg px-4 md:px-6 flex items-center gap-3">
            <button className="lg:hidden h-9 px-3 border-2 border-ink font-mono text-xs uppercase" onClick={() => setOpen(true)} aria-label="Open navigation">Menu</button>
            <NetBadge />
            <span className="hidden md:inline font-mono text-[11px] text-mute">
              {isDeployed() ? "Reading LensReader" : "No deployment configured — nothing below is live data"}
            </span>
            <div className="ml-auto"><WalletButton /></div>
          </header>
          <main className="relative flex-1 p-4 md:p-6 lg:p-10">
            <div className="pointer-events-none absolute inset-x-0 top-0 h-[420px] opacity-60 [mask-image:linear-gradient(to_bottom,black,transparent)]"><GlyphField /></div>
            <div className="relative">{children}</div>
          </main>
        </div>
      </div>
    </WalletProvider>
  );
}

export function PageHead({ eyebrow, title, children, aside }: { eyebrow: string; title: string; children?: ReactNode; aside?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4 mb-10">
      <div>
        <p className="font-mono text-xs uppercase text-bronze mb-3">§ {eyebrow}</p>
        <h1 className="font-stencil uppercase text-6xl md:text-8xl leading-[0.85] tracking-tight">{title}</h1>
        {children && <p className="mt-5 text-sm text-ink-2 max-w-2xl leading-relaxed pretty">{children}</p>}
      </div>
      {aside}
    </div>
  );
}
