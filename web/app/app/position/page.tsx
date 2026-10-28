import { PageHead } from "@/components/shell";
import { Empty, Panel, Tag } from "@/components/ui";
import { ActionPanel } from "@/components/action-panel";
import { FIELDS } from "@/lib/protocol";

const LEGEND = [
  ["ok", "Confirmed", "Read from chain at a known block."],
  ["warn", "Pending", "Transaction sent, not yet final."],
  ["mute", "Estimated", "Computed locally; interest keeps accruing."],
  ["bronze", "Encrypted", "Ciphertext handle; only you can request decryption."],
] as const;

export default function Position() {
  return (
    <>
      <PageHead eyebrow="Veilbook" title="Position">
        Only your connected wallet sees this page. Today every value here is also readable on chain; the encrypted state arrives with confidential mode.
      </PageHead>
      <div className="grid xl:grid-cols-[1fr_380px] gap-4 items-start">
        <div className="grid gap-4">
          <Panel title="Collateral & debt">
            <Empty title="Connect a wallet with an open position.">Values are labelled by provenance so you never mistake an estimate for chain state.</Empty>
          </Panel>
          <Panel title="Data provenance">
            <ul className="grid sm:grid-cols-2">
              {LEGEND.map(([t, k, d]) => (
                <li key={k} className="p-5 border-b sm:odd:border-r border-line grid gap-2">
                  <Tag tone={t}>{k}</Tag><p className="text-xs text-mute">{d}</p>
                </li>
              ))}
            </ul>
          </Panel>
          <Panel title="Who can see your fields">
            <ul>
              {FIELDS.filter((f) => f.today !== f.target).map((f) => (
                <li key={f.data} className="grid grid-cols-[1.5fr_1fr_1fr] px-5 py-3 border-b border-line last:border-0 text-sm">
                  <span>{f.data}</span><span className="font-mono text-xs text-warn">{f.today} now</span><span className="font-mono text-xs text-bronze">{f.target} later</span>
                </li>
              ))}
            </ul>
          </Panel>
        </div>
        <ActionPanel />
      </div>
    </>
  );
}
