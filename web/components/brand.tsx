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
