import { AdminGate } from "@/components/admin-gate";
import { AdminNav } from "@/components/admin-nav";
import { StatusBadge } from "@/components/status-badge";
import { getBackendStatus } from "@/lib/api";

// Every console page sits behind the gate. Pages load their data in client components once the gate has let the admin
// in (see AdminGate for why admin data is never fetched on the server).
export default async function ConsoleLayout({ children }: LayoutProps<"/">) {
  const status = await getBackendStatus();

  return (
    <div className="flex flex-1 flex-col md:flex-row">
      <aside className="flex flex-col gap-4 bg-foreground px-0 py-4 text-background md:sticky md:top-0 md:h-screen md:w-60 md:shrink-0 md:gap-8 md:py-6">
        <div className="flex items-center justify-between gap-3 px-4">
          <span className="flex items-center gap-2.5 font-heading text-lg font-bold tracking-[0.18em]">
            <span aria-hidden className="size-3 rotate-45 border-2 border-accent" />
            VEKTOR
          </span>
          <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-background/50 md:hidden">Console</span>
        </div>
        <AdminNav />
        <div className="mt-auto hidden flex-col gap-1 px-4 text-xs text-background/55 md:flex">
          <span className="font-semibold uppercase tracking-[0.14em] text-background/80">Console</span>
          <span className="[&_*]:text-background/60">
            <StatusBadge status={status} />
          </span>
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        <AdminGate>
          <main className="mx-auto w-full max-w-7xl px-6 py-8 lg:px-10 lg:py-10">{children}</main>
        </AdminGate>
      </div>
    </div>
  );
}
