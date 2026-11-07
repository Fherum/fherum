import { PageHead } from "@/components/shell";
import { Empty, Panel, Th } from "@/components/ui";
import { getNet } from "@/lib/net-server";
import { marketsFor, amt, tryReadMarket } from "@/lib/chain";
import { NET_CONFIG } from "@/lib/protocol";
import { readActivity, type EventName } from "@/lib/activity";

const LABEL: Record<EventName, string> = {
  Supplied: "Supply", Withdrawn: "Withdraw", CollateralAdded: "Add collateral", CollateralRemoved: "Remove collateral",
  Borrowed: "Borrow", Repaid: "Repay", Liquidated: "Liquidation",
};
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const when = (t: number) => (t ? new Date(t).toISOString().replace("T", " ").slice(0, 16) + " UTC" : "—");

export default async function Activity() {
  const { live, net } = await getNet();
  const markets = marketsFor(net);
  const explorer = NET_CONFIG[net].explorer?.replace(/\/$/, "") ?? null;
  const [rows, reads] = live && markets.length
    ? await Promise.all([readActivity(markets, net), Promise.all(markets.map((m) => tryReadMarket(m, net)))])
    : [[], []];
  const meta = new Map(reads.flatMap((r) => (r.ok ? [[r.m.address.toLowerCase(), r.m] as const] : [])));

  return (
    <>
      <PageHead eyebrow="Activity" title="Activity">Supply, borrow, repay, withdraw, collateral and liquidation events read from the market contracts, each linked to its transaction.</PageHead>
      <Panel title="Events" aside={<span className="font-mono text-[11px] text-mute">{rows ? rows.length : 0} events · {markets.length} markets</span>}>
        {rows === null ? (
          <Empty title="Could not read events.">The RPC did not answer. Nothing is shown rather than guessed; reload in a moment.</Empty>
        ) : rows.length === 0 ? (
          <Empty title="No events yet.">Events appear here once a supply, collateral, borrow, repay or withdraw is confirmed on-chain. Today every field is public; FHE privacy mode, when it ships, would redact private fields for everyone but you.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-line"><tr><Th>Event</Th><Th>Market</Th><Th>Account</Th><Th right>Amount</Th><Th>Time</Th><Th right>Tx</Th></tr></thead>
              <tbody>
                {rows.map((r) => {
                  const m = meta.get(r.market.toLowerCase());
                  const tok = m ? (r.side === "loan" ? m.loan : m.collateral) : null;
                  const pair = m ? `${m.collateral.symbol}/${m.loan.symbol}` : short(r.market);
                  return (
                    <tr key={`${r.tx}:${r.logIndex}`} className="border-b border-line last:border-0">
                      <td className="px-4 h-11 text-ink whitespace-nowrap">{LABEL[r.event]}</td>
                      <td className="px-4 font-mono text-xs whitespace-nowrap">{pair}</td>
                      <td className="px-4 font-mono text-xs text-mute">{explorer ? <a className="hover:text-bronze" href={`${explorer}/address/${r.user}`} target="_blank" rel="noreferrer">{short(r.user)}</a> : short(r.user)}</td>
                      <td className="px-4 num font-mono text-right whitespace-nowrap">{tok ? `${amt(r.amount, tok.decimals, tok.decimals > 6 ? 4 : 2)} ${tok.symbol}` : r.amount.toString()}</td>
                      <td className="px-4 font-mono text-xs text-mute whitespace-nowrap">{when(r.t)}</td>
                      <td className="px-4 font-mono text-xs text-right">{explorer ? <a className="text-bronze hover:underline" href={`${explorer}/tx/${r.tx}`} target="_blank" rel="noreferrer">{short(r.tx)} ↗</a> : short(r.tx)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </>
  );
}
