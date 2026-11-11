import { Tag } from "@/components/ui";
import type { AssayState, AssayView } from "@/lib/assay";

// ASSAY · dividend yield read onchain. Server component: every value comes from lib/assay.ts reads.
const CHIP: Record<AssayState, [string, "ok" | "warn" | "bad"]> = {
  NORMAL: ["Normal", "ok"],
  CORP_ACTION_PENDING: ["Corporate action scheduled · new borrows pause at effective time · repay open", "warn"],
  CORP_ACTION_ACTIVE: ["Corporate action · new borrows paused · repay open", "warn"],
  ISSUER_PAUSED: ["Issuer oracle pause · repay open", "warn"],
  UNEXPLAINED: ["Under review · repay open", "bad"],
};
const WEEK = 7 * 86400;
const day = (s: number) => new Date(s * 1000).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
const p4 = (x: number) => `${x >= 0 ? "+" : ""}${x.toFixed(4)}%`;
const wad = (s: string) => (Number(BigInt(s) / BigInt(10) ** BigInt(6)) / 1e12).toFixed(12);

export function AssayPanel({ a, symbol, explorer }: { a: AssayView; symbol: string; explorer: string | null }) {
  const ex = explorer?.replace(/\/$/, "") ?? null;
  const [label, tone] = CHIP[a.state];
  const lastDiv = a.entries.find((e) => e.cls === "DIVIDEND");
  const recent = a.state === "NORMAL" && lastDiv && a.asOf / 1000 - lastDiv.recordedAt < WEEK ? lastDiv : null;
  return (
    <div className="grid gap-5 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        {recent
          ? <Tag tone="ok">Dividend reinvested · {p4(recent.upliftPct)} · {day(recent.recordedAt)}</Tag>
          : <Tag tone={tone}>{label}</Tag>}
        <Tag tone={a.open ? "ok" : "warn"}>{a.open ? "Risk actions open" : "Borrow · remove collateral · liquidation paused"}</Tag>
      </div>

      <div className="grid sm:grid-cols-3 border border-line bg-s1">
        {([
          ["Dividend uplift since registry baseline", p4(a.upliftPct)],
          ["dividendIndex (WAD)", wad(a.dividendIndex)],
          [`${symbol}.uiMultiplier()`, wad(a.tokenMultiplier)],
        ] as [string, string][]).map(([k, v], i) => (
          <div key={k} className={`p-4 ${i ? "border-t sm:border-t-0 sm:border-l" : ""} border-line`}>
            <p className="font-mono text-[10px] uppercase text-mute">{k}</p>
            <p className="num text-xl font-medium leading-none mt-2">{v}</p>
          </div>
        ))}
      </div>

      {a.entries.length ? (
        <div className="overflow-x-auto">
          <table className="w-full font-mono text-xs">
            <thead><tr className="text-mute uppercase text-[10px] text-left">
              <th className="py-2 pr-4">Recorded</th><th className="py-2 pr-4">Class</th><th className="py-2 pr-4 text-right">Uplift</th><th className="py-2 pr-4 text-right">mPrev → mNow</th><th className="py-2">Tx</th>
            </tr></thead>
            <tbody>
              {a.entries.map((e) => (
                <tr key={e.eventId} className="border-t border-line">
                  <td className="py-2 pr-4 whitespace-nowrap">{day(e.recordedAt)}</td>
                  <td className="py-2 pr-4">{e.cls === "DIVIDEND" ? "Dividend reinvested" : e.cls === "CORP_ACTION" ? "Corporate action" : "Under review"}</td>
                  <td className="py-2 pr-4 text-right num">{e.cls === "DIVIDEND" ? p4(e.upliftPct) : "—"}</td>
                  <td className="py-2 pr-4 text-right num whitespace-nowrap">{wad(e.mPrev)} → {wad(e.mNow)}</td>
                  <td className="py-2">{e.tx && ex
                    ? <a href={`${ex}/tx/${e.tx}`} target="_blank" rel="noreferrer" className="hover:text-bronze underline decoration-line-2">{e.tx.slice(0, 10)}…{e.tx.slice(-6)}</a>
                    : <span className="text-mute">block {e.blockNumber}</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="font-mono text-[11px] uppercase text-mute">No multiplier change recorded since registration.</p>
      )}

      <p className="text-xs text-mute leading-relaxed">
        Stock collateral keeps its dividend yield, read onchain. Robinhood stock tokens reinvest dividends into the
        token&apos;s ERC-8056 uiMultiplier (not cash); ASSAY records each change and classifies it. Figures are past
        onchain records, not projections. A corporate action pauses new borrows and collateral withdrawals; repay and
        add collateral always stay open. Not investment advice. Not affiliated with Robinhood.
        {ex && <> Registry: <a href={`${ex}/address/${a.registry}`} target="_blank" rel="noreferrer" className="break-all hover:text-bronze underline decoration-line-2">{a.registry}</a></>}
      </p>
    </div>
  );
}
