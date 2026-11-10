import Link from "next/link";
import { Mark, XLink } from "@/components/brand";
import { GlyphField } from "@/components/fx/glyph-field";
import { StackedCards } from "@/components/fx/stacked-cards";
import { IronTags } from "@/components/fx/iron-tags";
import { SlideLine } from "@/components/fx/big-type";
import { FoundryPour } from "@/components/fx/foundry-pour";
import { VeilDemo } from "@/components/fx/veil-demo";
import { HealthFactorLab } from "@/components/hf-lab";
import { Marquee } from "@/components/fx/marquee";
import { ContractList } from "@/components/contract-list";
import { CaChip } from "@/components/ca-chip";
import { NetToggle, NetStatus, NetworkProvider } from "@/components/network-context";
import { FIELDS, isDeployed } from "@/lib/protocol";

const INK = "#120c08", PAPER = "#e9e4d8", MOLTEN = "#ff5a1f";


export default function Landing() {
  const live = isDeployed();
  return (
    <NetworkProvider>
    <div className="bg-[#050404] text-[#e9e4d8] overflow-x-clip">
      {/* NAV — Aztec-style hard bar */}
      <header className="fixed top-0 inset-x-0 z-50 text-[#e9e4d8] bg-[#050404]/70 backdrop-blur-md border-b border-[#e9e4d8]/10">
        <div className="flex items-center justify-between px-5 md:px-8 h-16">
          <Link href="/" className="flex items-center gap-2.5"><Mark size={26} /><span className="font-stencil text-xl tracking-[0.12em]">FHERUM</span></Link>
          <nav className="hidden md:flex gap-8 font-mono text-[12px] uppercase [&>a]:opacity-75 [&>a:hover]:opacity-100 [&>a:hover]:text-[#ff5a1f]">
            <a href="#problem">Problem</a><a href="#veil">Veilbook</a><a href="#risk">Ironclad</a><a href="#stack">Stack</a><a href="#contracts">Contracts</a>
          </nav>
          <div className="flex items-center gap-3"><XLink className="h-9 w-9 justify-center border border-[#e9e4d8]/30 hover:text-[#ff5a1f] hover:border-[#ff5a1f]" /><NetToggle className="hidden sm:inline-flex" /><Link href="/app" className="font-mono text-[12px] uppercase border border-[#e9e4d8] px-4 h-9 inline-flex items-center hover:bg-[#ff5a1f] hover:border-[#ff5a1f] hover:text-black">{live ? "Launch app" : "Preview app"} →</Link></div>
        </div>
      </header>

      {/* HERO — foundry poster: stencil watermark, serif headline, halftone pour panels */}
      <section className="relative h-dvh min-h-[720px] overflow-hidden bg-bg pt-16">
        <div className="absolute top-16 bottom-0 left-0 w-[14%] hidden md:block border-r border-line"><FoundryPour side="l" /></div>
        <div className="absolute top-16 bottom-0 right-0 w-[14%] hidden md:block border-l border-line"><FoundryPour side="r" /></div>
        <div aria-hidden className="absolute top-16 bottom-0 inset-x-0 md:inset-x-[14%] grid place-items-center overflow-hidden bg-s1">
          <span className="font-stencil leading-none text-s3 text-[22vw] tracking-[-0.02em] select-none">FHERUM</span>
        </div>
        <div aria-hidden className="absolute inset-x-0 bottom-0 h-24 pointer-events-none bg-gradient-to-b from-transparent to-bg" />
        <div className="relative h-full md:mx-[14%] px-5 md:px-10 flex flex-col">
          <div className="pt-8 text-center"><span className="inline-block bg-bronze text-black font-mono text-xs uppercase px-2 py-0.5">FHE-ready money markets · Robinhood Chain</span><div className="mt-3 flex justify-center"><CaChip /></div></div>
          <h1 className="mt-auto font-stencil uppercase text-ink leading-[0.86] tracking-[-0.005em] text-[clamp(44px,6.4vw,112px)]">
            <span className="block"><span className="text-bronze">Private</span> positions, by design.</span>
            <span className="block md:text-right text-ink/40"><span className="text-bronze">Public</span> market accountability.</span>
          </h1>
          <div className="relative mt-10 mb-8 grid gap-6">
            <div className="flex flex-wrap items-end justify-between gap-6">
              <p className="max-w-md text-ink-2 text-[15px] leading-relaxed">Lend and borrow on Robinhood Chain with an Aave V4-inspired hub-and-spoke design, built for FHE privacy. Live on mainnet.</p>
              <div className="flex gap-3">
                <Link href="/app" className="h-12 px-5 inline-flex items-center bg-bronze text-black font-mono text-xs uppercase hover:brightness-110">{live ? "Launch app" : "Preview app"} →</Link>
                <a href="#problem" className="h-12 px-5 inline-flex items-center border border-line-2 text-ink font-mono text-xs uppercase hover:border-bronze hover:text-bronze">Why</a>
              </div>
            </div>
            <NetStatus />
          </div>
        </div>
      </section>

      <div style={{ background: MOLTEN, color: INK }}>
        <Marquee items={["VEILBOOK · FHE-ready positions", "IRONCLAD · fail-closed solvency checks", "FORGEHUB · risk-curated hub & spoke", "STEEL LENS · public aggregates", "IRON GATE · optional eligibility", "BREAKGLASS · pause never blocks repay"]} />
      </div>

      {/* PROBLEM — deep steel field with glyph rain + scroll-stacked cards */}
      <section id="problem" className="relative bg-[#0c1a24]">
        <div className="absolute inset-0 opacity-90"><GlyphField color={MOLTEN} dim="rgba(233,228,216,.07)" /></div>
        <div className="relative px-5 md:px-8 pt-28">
          <p className="font-mono text-xs uppercase text-[#ff5a1f]">§01 — The problem</p>
          <h2 className="font-display italic text-[13vw] lg:text-[160px] leading-[0.85] mt-4">Privacy—<br /><span className="not-italic font-stencil uppercase text-[#e9e4d8]">is a solvency<br />problem.</span></h2>
        </div>
        <div className="relative"><StackedCards /></div>
      </section>

      {/* VEILBOOK — paper field, real field matrix */}
      <section id="veil" className="relative" style={{ background: PAPER, color: INK }}>
        <SlideLine className="font-stencil uppercase text-[22vw] leading-[0.8] text-[#120c08]/[0.07] pt-10">Veilbook · Veilbook · Veilbook</SlideLine>
        <div className="px-5 md:px-8 pb-28 -mt-[10vw] grid lg:grid-cols-[1fr_1.1fr] gap-12 relative">
          <div>
            <p className="font-mono text-xs uppercase">§02 — Veilbook</p>
            <h2 className="font-stencil uppercase text-6xl md:text-8xl leading-[0.85] mt-4">Ciphertext<br />in. Solvency<br /><span className="bg-[#ff5a1f] px-2">out.</span></h2>
            <p className="mt-6 max-w-md text-[15px] leading-relaxed text-[#3a2e24]">The design encrypts the borrower, not the market. Toggle the view to see what an observer would get once FHE privacy mode ships — today every field is public.</p>
            <div className="mt-8 bg-[#050404] text-[#e9e4d8] p-1 shadow-[10px_10px_0_#ff5a1f]"><VeilDemo /></div>
          </div>
          <div className="border-2 border-[#120c08] bg-[#e9e4d8] shadow-[10px_10px_0_#120c08] self-start">
            <div className="grid grid-cols-[1.6fr_1fr_1fr] border-b-2 border-[#120c08] px-4 h-11 items-center font-mono text-[11px] uppercase">
              <span>What an observer sees</span><span>Today</span><span>Target</span>
            </div>
            <ul>
              {FIELDS.map((f) => {
                const ch = f.today !== f.target;
                return (
                  <li key={f.data} className="grid grid-cols-[1.6fr_1fr_1fr] px-4 py-3 border-b border-[#120c08]/20 last:border-0 text-sm items-center hover:bg-[#120c08] hover:text-[#e9e4d8] transition-colors">
                    <span>{f.data}</span><span className="font-mono text-xs">{f.today}</span>
                    <span className={`font-mono text-xs ${ch ? "font-semibold" : "opacity-60"}`}>{ch && <span className="text-[#ff5a1f]">◆ </span>}{f.target}</span>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      </section>

      {/* IRONCLAD — oxide field, interactive HF lab */}
      <section id="risk" className="relative bg-[#2a0b06] px-5 md:px-8 py-28">
        <div className="grid lg:grid-cols-[1fr_1.4fr] gap-12 items-end mb-14">
          <div>
            <p className="font-mono text-xs uppercase text-[#ff5a1f]">§03 — Ironclad</p>
            <h2 className="font-stencil uppercase text-6xl md:text-8xl leading-[0.85] mt-4">One number<br />decides<br /><span className="text-[#ff5a1f]">liquidation.</span></h2>
          </div>
          <p className="font-display italic text-3xl md:text-5xl leading-tight text-[#e9e4d8]/90">HF = collateral × LT ÷ debt.<br /><span className="text-[#e9e4d8]/50">Below 1.00, the forge takes it.</span></p>
        </div>
        <div className="border-2 border-[#e9e4d8] bg-[#050404] p-1 shadow-[12px_12px_0_#ff5a1f]"><HealthFactorLab /></div>
      </section>

      {/* STACK — paper, stamped iron tags */}
      <section id="stack" style={{ background: PAPER, color: INK }} className="px-5 md:px-8 py-28">
        <div className="flex flex-wrap items-end justify-between gap-6 mb-14">
          <div>
            <p className="font-mono text-xs uppercase">§04 — The stack</p>
            <h2 className="font-stencil uppercase text-6xl md:text-9xl leading-[0.82] mt-4">Six modules.<br />One forge.</h2>
          </div>
          <p className="max-w-xs font-mono text-xs uppercase leading-relaxed">Status is what exists in this repository — not a roadmap. Click a tag to read it.</p>
        </div>
        <IronTags />
      </section>

      

      <section id="contracts" className="bg-[#0b0806] text-[#e9e4d8] px-5 md:px-8 py-28 border-t-2 border-[#e9e4d8]/20">
        <p className="font-mono text-xs uppercase text-[#ff5a1f]">§06 — Contracts</p>
        <h2 className="mt-4 font-stencil uppercase text-6xl md:text-8xl leading-[0.85]">Verify, don&apos;t trust.</h2>
        <p className="mt-4 max-w-2xl text-sm text-[#e9e4d8]/70 leading-relaxed">Every contract this app talks to, per network. Switch networks and the list follows; each address links straight to the block explorer.</p>
        <div className="mt-10"><ContractList /></div>
      </section>

      <footer className="bg-[#ff5a1f] text-black">
        <SlideLine dir={-1} className="font-stencil uppercase text-[26vw] leading-[0.78] pt-6">FHERUM FHERUM</SlideLine>
        <div className="px-5 md:px-8 py-8 grid md:grid-cols-[1fr_auto] gap-6 font-mono text-[11px] uppercase border-t-2 border-black">
          <p className="max-w-lg normal-case text-xs leading-relaxed">FHE-ready money markets. Positions are public today. Tokenized stock tokens are debt instruments providing economic exposure, not direct share ownership. Not audited unless stated; not investment advice.</p>
          <span className="flex flex-wrap items-center gap-6"><XLink label className="underline underline-offset-4" /><Link href="/risk" className="underline underline-offset-4">Risk disclosure</Link><Link href="/app" className="underline underline-offset-4">App preview →</Link></span>
        </div>
      </footer>
    </div>
    </NetworkProvider>
  );
}
