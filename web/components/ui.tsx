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
    <span className="inline-flex items-center gap-1.5 border border-line px-2 py-[3px] font-mono text-[11px] leading-none text-ink-2 whitespace-nowrap">
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
    <section className={`border border-line bg-s1 ${className}`}>
      {(title || aside) && (
        <header className="flex items-center justify-between gap-4 border-b border-line px-4 h-11">
          <h2 className="eyebrow">{title}</h2>
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
      <p className="text-ink text-[15px]">{title}</p>
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
      ? "chamfer-sm bg-ink text-bg hover:bg-white"
      : "border border-line-2 text-ink hover:border-mute";
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
