"use client";

import { useEffect } from "react";

/** Writes pointer position to CSS vars for the page-wide spotlight. */
export function Spotlight() {
  useEffect(() => {
    const h = (e: PointerEvent) => {
      document.documentElement.style.setProperty("--mx", `${e.clientX}px`);
      document.documentElement.style.setProperty("--my", `${e.clientY}px`);
    };
    window.addEventListener("pointermove", h, { passive: true });
    return () => window.removeEventListener("pointermove", h);
  }, []);
  return <div aria-hidden className="spotlight pointer-events-none fixed inset-0 z-0" />;
}
