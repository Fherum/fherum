import Image from "next/image";
import Link from "next/link";

export function Mark({ size = 28, priority = false }: { size?: number; priority?: boolean }) {
  // Source art is on pure black; `lighten` drops the black so it sits on graphite.
  return (
    <Image
      src={size > 96 ? "/brand/mark-512.png" : "/brand/mark-96.png"}
      alt=""
      width={size}
      height={size}
      priority={priority}
      className="mix-blend-lighten select-none"
    />
  );
}

export function Wordmark({ href = "/" }: { href?: string }) {
  return (
    <Link href={href} className="inline-flex items-center gap-2.5" aria-label="FHERUM home">
      <Mark size={26} />
      <span className="steel font-medium tracking-[0.22em] text-[13px]">FHERUM</span>
    </Link>
  );
}

export const X_URL = "https://x.com/Fherumfi";

/** Link to FHERUM on X, with the X glyph. */
export function XLink({ className = "", label = false }: { className?: string; label?: boolean }) {
  return (
    <a href={X_URL} target="_blank" rel="noopener noreferrer" aria-label="FHERUM on X" title="@Fherumfi on X"
      className={`inline-flex items-center gap-2 ${className}`}>
      <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="currentColor">
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
      </svg>
      {label && <span>@Fherumfi</span>}
    </a>
  );
}
