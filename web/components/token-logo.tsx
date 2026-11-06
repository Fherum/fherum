/** Asset logos keyed by symbol. Unknown symbols fall back to a monogram badge (never a wrong logo).
 *  Brand marks (e.g. Tesla) are shown only to identify the underlying asset; no affiliation implied. */
import type { ReactNode } from "react";

const ALIAS: Record<string, string> = { WETH: "ETH", TETH: "ETH", ETH: "ETH", USDG: "USDG", TUSD: "USD", USDC: "USDC", USDT: "USDT",
  WBTC: "BTC", BTC: "BTC", TSLA: "TSLA", TSLAX: "TSLA", AAPL: "AAPL", AAPLX: "AAPL", NVDA: "NVDA", NVDAX: "NVDA", HOOD: "HOOD", HOODX: "HOOD" };

const disc = (bg: string, child: ReactNode) => (
  <>
    <circle cx="16" cy="16" r="16" fill={bg} />
    {child}
  </>
);

const ART: Record<string, { bg: string; node: ReactNode }> = {
  ETH: { bg: "#627EEA", node: disc("#627EEA", <g fill="#fff"><path d="M16 4v8.9l7.5 3.3z" fillOpacity=".6" /><path d="M16 4 8.5 16.2l7.5-3.3z" /><path d="M16 22v6l7.5-10.4z" fillOpacity=".6" /><path d="M16 28v-6l-7.5-4.4z" /><path d="m16 20.6 7.5-4.4-7.5-3.3z" fillOpacity=".2" /><path d="m8.5 16.2 7.5 4.4v-7.7z" fillOpacity=".6" /></g>) },
  USDG: { bg: "#0B1F3A", node: disc("#0B1F3A", <text x="16" y="21.5" textAnchor="middle" fontSize="15" fontWeight="700" fill="#fff" fontFamily="Arial, sans-serif">$</text>) },
  USD: { bg: "#2F6B3A", node: disc("#2F6B3A", <text x="16" y="21.5" textAnchor="middle" fontSize="15" fontWeight="700" fill="#fff" fontFamily="Arial, sans-serif">$</text>) },
  USDC: { bg: "#2775CA", node: disc("#2775CA", <text x="16" y="21.5" textAnchor="middle" fontSize="15" fontWeight="700" fill="#fff" fontFamily="Arial, sans-serif">$</text>) },
  USDT: { bg: "#26A17B", node: disc("#26A17B", <text x="16" y="21.5" textAnchor="middle" fontSize="15" fontWeight="700" fill="#fff" fontFamily="Arial, sans-serif">₮</text>) },
  BTC: { bg: "#F7931A", node: disc("#F7931A", <text x="16" y="22" textAnchor="middle" fontSize="17" fontWeight="700" fill="#fff" fontFamily="Arial, sans-serif">₿</text>) },
  // Tesla "T": blade + stem
  TSLA: { bg: "#E31937", node: disc("#E31937", <g fill="#fff"><path d="M6.5 9.2c3.4-1.5 6.2-2 9.5-2s6.1.5 9.5 2l-.6 1.3c-2.3-.9-4.4-1.3-6.4-1.4L16 12.2l-2.5-3.1c-2 .1-4.1.5-6.4 1.4z" /><path d="M14.3 10.4 16 12.6l1.7-2.2 .1 1-1.8 16-1.8-16z" /></g>) },
  AAPL: { bg: "#111", node: disc("#111", <path fill="#fff" d="M20.3 16.6c0-2 1.6-2.9 1.7-3-0.9-1.4-2.4-1.6-2.9-1.6-1.2-.1-2.4.7-3 .7s-1.6-.7-2.6-.7c-1.3 0-2.6.8-3.3 2-1.4 2.4-.4 6 1 8 .7 1 1.4 2 2.5 2 1 0 1.4-.6 2.6-.6s1.5.6 2.6.6c1.1 0 1.8-1 2.4-2 .8-1.1 1.1-2.2 1.1-2.3 0 0-2.1-.8-2.1-3.1zM18.4 10.6c.5-.7.9-1.6.8-2.5-.8 0-1.7.5-2.3 1.2-.5.6-.9 1.5-.8 2.4.9.1 1.7-.4 2.3-1.1z" />) },
  NVDA: { bg: "#76B900", node: disc("#76B900", <text x="16" y="20.5" textAnchor="middle" fontSize="10" fontWeight="800" fill="#fff" fontFamily="Arial, sans-serif">NV</text>) },
  HOOD: { bg: "#00C805", node: disc("#00C805", <path fill="#0b0b0b" d="M10 23 18.5 8.5c2.8 1.2 4.3 3.4 4 6.4-.3 2.4-2 4.3-4.5 5.4L16.4 23z" />) },
};

export const canonical = (sym: string) => ALIAS[sym.toUpperCase()] ?? sym.toUpperCase();

export function TokenLogo({ symbol, size = 28, className = "" }: { symbol: string; size?: number; className?: string }) {
  const k = canonical(symbol);
  const art = ART[k];
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} className={`shrink-0 ${className}`} role="img" aria-label={`${symbol} logo`}>
      {art ? art.node : disc("var(--s3)", <text x="16" y="20" textAnchor="middle" fontSize={k.length > 3 ? 8 : 10} fontWeight="700" fill="var(--ink)" fontFamily="var(--font-plex-mono), monospace">{k.slice(0, 4)}</text>)}
    </svg>
  );
}

/** Collateral logo overlapped by loan logo. */
export function PairLogo({ col, loan, size = 28 }: { col: string; loan: string; size?: number }) {
  return (
    <span className="inline-flex items-center">
      <TokenLogo symbol={col} size={size} />
      <TokenLogo symbol={loan} size={size} className="-ml-2 ring-2 ring-[var(--bg)] rounded-full" />
    </span>
  );
}
