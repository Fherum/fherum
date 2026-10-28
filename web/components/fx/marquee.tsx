export function Marquee({ items }: { items: string[] }) {
  const row = [...items, ...items];
  return (
    <div className="overflow-hidden border-y border-line bg-s1/60 marquee-mask" aria-label={items.join(". ")}>
      <div className="marquee flex gap-10 py-3 w-max font-mono text-[11px] text-mute whitespace-nowrap" aria-hidden>
        {row.map((t, i) => <span key={i} className="flex items-center gap-10"><span>{t}</span><span className="text-bronze">◆</span></span>)}
      </div>
    </div>
  );
}
