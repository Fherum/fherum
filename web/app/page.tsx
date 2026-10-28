import Link from "next/link";
import { Mark } from "@/components/brand";
import { ForgeShader } from "@/components/fx/forge-shader";
import { GlyphField } from "@/components/fx/glyph-field";
import { StackedCards } from "@/components/fx/stacked-cards";
import { IronTags } from "@/components/fx/iron-tags";
import { SlideLine } from "@/components/fx/big-type";
import { Hero3D } from "@/components/fx/hero3d";
import { VeilDemo } from "@/components/fx/veil-demo";
import { HealthFactorLab } from "@/components/hf-lab";
import { Marquee } from "@/components/fx/marquee";
import { FIELDS, TARGET_CHAIN, isDeployed } from "@/lib/protocol";

const INK = "#120c08", PAPER = "#e9e4d8", MOLTEN = "#ff5a1f";

const LIMITS = [
  ["Not anonymity", "Wallet address, timing and ERC-20 transfer amounts stay visible on Robinhood Chain."],
  ["Not live", "No FHE provider serves chain 4663 or 46630 yet. Until one does, positions are public."],
  ["Not MEV-proof", "No such claim without a defined threat model and evidence."],
  ["Not Aave", "Hub & spoke is inspired by Aave V4. No Aave contracts, no Aave liquidity."],
  ["Not audited", "Contracts are unaudited and not deployed. Do not send funds."],
];

export default function Landing() {
  const live = isDeployed();
  return (
    <div className="bg-[#050404] text-[#e9e4d8] overflow-x-clip">
      {/* NAV — Aztec-style hard bar */}
      <header className="fixed top-0 inset-x-0 z-50 mix-blend-difference text-white">
        <div className="flex items-center justify-between px-5 md:px-8 h-16">
          <Link href="/" className="flex items-center gap-2.5"><Mark size={26} /><span className="font-stencil text-xl tracking-[0.12em]">FHERUM</span></Link>
          <nav className="hidden md:flex gap-8 font-mono text-[12px] uppercase">
            <a href="#problem">Problem</a><a href="#veil">Veilbook</a><a href="#risk">Ironclad</a><a href="#stack">Stack</a><a href="#limits">Limits</a>
          </nav>
          <Link href="/app" className="font-mono text-[12px] uppercase border border-white px-4 h-9 inline-flex items-center hover:bg-white hover:text-black">{live ? "Launch app" : "Preview app"} →</Link>
        </div>
      </header>

      {/* HERO — molten field + framed slab */}
      <section className="relative h-dvh min-h-[720px]">
        <div className="absolute inset-0"><ForgeShader /></div>
        <div className="relative z-10 h-full grid grid-rows-[1fr_auto] pt-24 px-5 md:px-8 pb-6 pointer-events-none">
          <div className="grid lg:grid-cols-[1.2fr_1fr] items-center gap-6">
            <div className="relative bg-[#050404]/88 border-2 border-[#e9e4d8] p-6 md:p-10 max-w-[860px] pointer-events-auto">
              <span className="absolute -top-3 left-6 bg-[#ff5a1f] text-black font-mono text-[11px] uppercase px-2 py-0.5">Now forging · {TARGET_CHAIN.name}</span>
              <h1 className="font-stencil uppercase leading-[0.82] text-[18vw] lg:text-[148px] tracking-[-0.01em]">
                Encrypted<br /><span className="text-[#ff5a1f]">money</span><br />markets
              </h1>
              <div className="mt-8 grid md:grid-cols-[1fr_auto] gap-6 items-end">
                <p className="max-w-md text-[15px] leading-relaxed text-[#e9e4d8]/80">
                  FHE-powered confidential lending architecture for Robinhood Chain. <strong className="text-[#e9e4d8] font-medium">Private borrower positions. Public market accountability.</strong>
                </p>
                <div className="flex gap-2">
                  <Link href="/app" className="bg-[#ff5a1f] text-black font-mono text-xs uppercase h-12 px-5 inline-flex items-center hover:bg-[#e9e4d8] shadow-[5px_5px_0_#e9e4d8]">{live ? "Launch app" : "Preview app"} →</Link>
                  <a href="#problem" className="border-2 border-[#e9e4d8] font-mono text-xs uppercase h-12 px-5 inline-flex items-center hover:bg-[#e9e4d8] hover:text-black">Why</a>
                </div>
              </div>
            </div>
            <div className="relative h-[420px] lg:h-[700px] lg:scale-105 pointer-events-auto hidden md:block"><Hero3D /></div>
          </div>
          <dl className="grid grid-cols-2 md:grid-cols-4 border-2 border-[#e9e4d8] bg-[#050404]/88 font-mono text-[11px] uppercase pointer-events-auto">
            {[["Chain", `${TARGET_CHAIN.id} · testnet`], ["Contracts", live ? "Deployed" : "Not deployed"], ["Privacy", "Public · FHE pending"], ["Audit", "None yet"]].map(([k, v], i) => (
              <div key={k} className={`p-3 ${i ? "border-l-2 border-[#e9e4d8]" : ""} max-md:[&:nth-child(3)]:border-l-0 max-md:[&:nth-child(n+3)]:border-t-2`}>
                <dt className="text-[#e9e4d8]/50">{k}</dt><dd className="mt-1">{v}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <div style={{ background: MOLTEN, color: INK }}>
        <Marquee items={["VEILBOOK · confidential positions", "IRONCLAD · solvency on ciphertext", "FORGEHUB · curated hub & spoke", "STEEL LENS · public aggregates", "IRON GATE · optional eligibility", "BREAKGLASS · pause never blocks repay"]} />
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
            <p className="mt-6 max-w-md text-[15px] leading-relaxed text-[#3a2e24]">Encrypt the borrower, not the market. Toggle the view to see what an observer would get once confidential mode ships.</p>
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

      {/* LIMITS — black, giant numbered list */}
      <section id="limits" className="bg-[#050404] px-5 md:px-8 py-28">
        <p className="font-mono text-xs uppercase text-[#ff5a1f]">§05 — What we do not promise</p>
        <ol className="mt-10 border-t-2 border-[#e9e4d8]">
          {LIMITS.map(([h, b], i) => (
            <li key={h} className="group grid md:grid-cols-[120px_1fr_1fr] gap-4 items-baseline py-6 border-b-2 border-[#e9e4d8]/20 hover:bg-[#ff5a1f] hover:text-black transition-colors px-2 -mx-2">
              <span className="font-mono text-xs">0{i + 1}</span>
              <span className="font-stencil uppercase text-5xl md:text-7xl leading-none">{h}</span>
              <span className="text-sm leading-relaxed text-[#e9e4d8]/70 group-hover:text-black">{b}</span>
            </li>
          ))}
        </ol>
      </section>

      <footer className="bg-[#ff5a1f] text-black">
        <SlideLine dir={-1} className="font-stencil uppercase text-[26vw] leading-[0.78] pt-6">FHERUM FHERUM</SlideLine>
        <div className="px-5 md:px-8 py-8 grid md:grid-cols-[1fr_auto] gap-6 font-mono text-[11px] uppercase border-t-2 border-black">
          <p className="max-w-lg normal-case text-xs leading-relaxed">Encrypted money markets. Tokenized stock tokens are debt instruments providing economic exposure, not direct share ownership. Docs, explorer, GitHub, risk disclosure and terms ship with the testnet.</p>
          <Link href="/app" className="underline underline-offset-4">App preview →</Link>
        </div>
      </footer>
    </div>
  );
}
