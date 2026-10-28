import { PageHead } from "@/components/shell";
import { Empty, Panel, Th } from "@/components/ui";
import { PAUSE_MATRIX, ROLES } from "@/lib/protocol";

export default function Curator() {
  return (
    <>
      <PageHead eyebrow="Forgehub · Breakglass" title="Curator console">
        Curators queue parameter changes; the timelock executes them. The guardian can pause, never move funds.
      </PageHead>
      <div className="grid gap-4">
        <div className="grid lg:grid-cols-2 gap-4">
          <Panel title="Markets you curate"><Empty title="Connect a curator wallet.">Markets assigned in CuratorRegistry appear here with current and queued parameters.</Empty></Panel>
          <Panel title="Timelock queue"><Empty title="Nothing queued.">Each queued change shows its target value, the hard bound it sits within, and a countdown to its earliest execution block.</Empty></Panel>
        </div>
        <Panel title="Permission matrix">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="border-b border-line"><tr><Th>Role</Th><Th>Held by</Th><Th>Can</Th><Th>Cannot</Th></tr></thead>
              <tbody>
                {ROLES.map((r) => (
                  <tr key={r.role} className="border-b border-line last:border-0 align-top">
                    <td className="px-4 py-4 text-ink">{r.role}</td>
                    <td className="px-4 py-4 text-mute text-xs">{r.holder}</td>
                    <td className="px-4 py-4"><ul className="grid gap-1 text-ink-2">{r.can.map((c) => <li key={c}><span aria-hidden className="text-ok">+ </span>{c}</li>)}</ul></td>
                    <td className="px-4 py-4"><ul className="grid gap-1 text-mute">{r.cannot.map((c) => <li key={c}><span aria-hidden className="text-bad">− </span>{c}</li>)}</ul></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
        <Panel title="Under pause">
          <ul className="grid sm:grid-cols-3 lg:grid-cols-6">
            {PAUSE_MATRIX.map((p, i) => (
              <li key={p.action} className={`p-5 grid gap-2 border-line ${i ? "border-l" : ""} max-sm:border-l-0 max-sm:border-t`}>
                <span className="text-sm text-ink-2">{p.action}</span>
                <span className={`font-mono text-xs ${p.paused ? "text-bad" : "text-ok"}`}>{p.paused ? "■ Stops" : "● Continues"}</span>
              </li>
            ))}
          </ul>
        </Panel>
      </div>
    </>
  );
}
