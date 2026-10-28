import type { Metadata } from "next";
import { IBM_Plex_Sans, IBM_Plex_Mono, Instrument_Serif, Big_Shoulders } from "next/font/google";
import "./globals.css";

const sans = IBM_Plex_Sans({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-plex-sans" });
const mono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-plex-mono" });
const display = Instrument_Serif({ subsets: ["latin"], weight: "400", style: ["normal", "italic"], variable: "--font-display-serif" });

const stencil = Big_Shoulders({ subsets: ["latin"], weight: ["800", "900"], variable: "--font-stencil" });

export const metadata: Metadata = {
  title: "FHERUM — Encrypted money markets",
  description:
    "FHERUM is building an FHE-powered confidential money market on Robinhood Chain: curated lending with public market accountability.",
  icons: { icon: "/brand/mark-96.png" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable} ${display.variable} ${stencil.variable}`}>
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
