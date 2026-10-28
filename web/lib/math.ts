// Reference math for UI explanations only (floating point, display-grade).
// Contracts use WAD/RAY fixed-point with explicit rounding; see README.

export function healthFactor(collateral: number, lt: number, debt: number): number {
  if (debt <= 0) return Infinity;
  return (collateral * lt) / debt;
}

export function borrowRate(u: number, r0: number, s1: number, s2: number, uOpt: number): number {
  const U = Math.min(Math.max(u, 0), 1);
  if (uOpt <= 0 || uOpt >= 1) return NaN;
  return U <= uOpt ? r0 + (s1 * U) / uOpt : r0 + s1 + (s2 * (U - uOpt)) / (1 - uOpt);
}

/** x = (HF_T·D − LT·C) / (HF_T − LT·b), single-collateral simplification. */
export function repayToTarget(c: number, lt: number, d: number, b: number, hfT: number): number | null {
  const den = hfT - lt * b;
  if (den <= 0) return null;
  const x = (hfT * d - lt * c) / den;
  if (x <= 0 || x > d) return null;
  return x;
}

export const fmtUsd = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

export const fmtHf = (n: number) => (Number.isFinite(n) ? n.toFixed(2) : "∞");

export const fmtPct = (n: number, d = 2) => `${(n * 100).toFixed(d)}%`;
