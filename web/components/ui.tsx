import type { ReactNode } from "react";

type Tone = "ok" | "warn" | "bad" | "mute" | "bronze";
const toneCls: Record<Tone, string> = {
  ok: "text-ok",
  warn: "text-warn",
  bad: "text-bad",
  mute: "text-mute",
  bronze: "text-bronze",
};
// Shape + label carry the meaning; colour is the third signal, never the only one.
const glyph: Record<Tone, string> = { ok: "●", warn: "▲", bad: "■", mute: "○", bronze: "◆" };

export function Tag({ tone = "mute", children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 border border-line-2 bg-bg px-2 py-[3px] font-mono text-[11px] leading-none text-ink-2 whitespace-nowrap">
      <span aria-hidden className={`${toneCls[tone]} text-[8px]`}>{glyph[tone]}</span>
      {children}
    </span>
  );
}

export function Panel({
  title,
  aside,
  children,
  className = "",
}: {
  title?: ReactNode;
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`border-2 border-ink bg-s1 shadow-[8px_8px_0_var(--bronze)] transition-[transform,box-shadow] hover:-translate-y-0.5 hover:shadow-[12px_12px_0_var(--bronze)] ${className}`}>
      {(title || aside) && (
        <header className="flex items-center justify-between gap-4 border-b-2 border-ink px-4 h-12 bg-ink text-bg">
          <h2 className="font-stencil uppercase text-xl tracking-wide">{title}</h2>
          {aside}
        </header>
      )}
      {children}
    </section>
  );
}

export function Empty({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="px-6 py-10 grid gap-2 max-w-xl">
      <p className="font-stencil uppercase text-4xl leading-none">{title}</p>
      {children && <div className="text-mute text-sm leading-relaxed pretty">{children}</div>}
      {action && <div className="pt-2">{action}</div>}
    </div>
  );
}

export function Btn({
  children,
  variant = "primary",
  href,
  disabled,
  title,
}: {
  children: ReactNode;
  variant?: "primary" | "ghost";
  href?: string;
  disabled?: boolean;
  title?: string;
}) {
  const cls =
    variant === "primary"
      ? "bg-bronze text-black font-mono uppercase text-xs shadow-[4px_4px_0_var(--ink)] hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[2px_2px_0_var(--ink)]"
      : "border-2 border-ink text-ink font-mono uppercase text-xs hover:bg-ink hover:text-bg";
  const base = `inline-flex h-10 items-center gap-2 px-4 text-sm font-medium transition-colors ${cls} ${
    disabled ? "opacity-40 pointer-events-none" : ""
  }`;
  if (href)
    return (
      <a href={href} className={base} title={title}>
        {children}
      </a>
    );
  return (
    <button type="button" className={base} disabled={disabled} title={title}>
      {children}
    </button>
  );
}

/** Table header cell with consistent mono eyebrow. */
export function Th({ children, right }: { children: ReactNode; right?: boolean }) {
  return (
    <th scope="col" className={`eyebrow font-normal px-4 h-10 ${right ? "text-right" : "text-left"} whitespace-nowrap`}>
      {children}
    </th>
  );
}
