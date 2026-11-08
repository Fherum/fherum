/** Instant feedback while a page reads the chain server-side. Shell stays mounted; only the content area waits. */
export default function Loading() {
  return (
    <div role="status" aria-live="polite" className="grid gap-6">
      <div className="grid gap-2">
        <div className="h-3 w-24 bg-s2 motion-safe:animate-pulse" />
        <div className="h-8 w-64 bg-s2 motion-safe:animate-pulse" />
      </div>
      <div className="grid gap-px border border-line">
        {Array.from({ length: 5 }, (_, i) => <div key={i} className="h-14 bg-s1 motion-safe:animate-pulse" />)}
      </div>
      <span className="font-mono text-[10px] uppercase text-mute">Reading chain…</span>
    </div>
  );
}
