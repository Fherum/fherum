import { Suspense } from "react";
import { AppShell } from "@/components/shell";
import { getNet } from "@/lib/net-server";

// The network cookie is request data, so it must be read inside <Suspense> (cacheComponents).
async function WithNet({ children }: { children: React.ReactNode }) {
  const { net } = await getNet();
  return <AppShell net={net}>{children}</AppShell>;
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<div className="min-h-dvh grid place-items-center font-mono text-xs uppercase text-mute">forging…</div>}>
      <WithNet>{children}</WithNet>
    </Suspense>
  );
}
