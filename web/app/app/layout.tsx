import { Suspense } from "react";
import { AppShell } from "@/components/shell";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<div className="min-h-dvh grid place-items-center font-mono text-xs uppercase text-mute">forging…</div>}>
      <AppShell>{children}</AppShell>
    </Suspense>
  );
}
