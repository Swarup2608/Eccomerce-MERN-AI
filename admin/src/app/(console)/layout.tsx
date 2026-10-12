import { AdminGate } from "@/components/admin-gate";
import { AdminNav } from "@/components/admin-nav";
import { StatusBadge } from "@/components/status-badge";
import { getBackendStatus } from "@/lib/api";

// Every console page sits behind the gate. Pages load their data in client components once the gate has let the admin
// in (see AdminGate for why admin data is never fetched on the server).
export default async function ConsoleLayout({ children }: LayoutProps<"/">) {
  const status = await getBackendStatus();

  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b border-black/10 dark:border-white/10">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <span className="text-lg font-semibold tracking-tight">Admin Console</span>
          <StatusBadge status={status} />
        </div>
      </header>

      <AdminGate>
        <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 px-6 py-8 md:flex-row">
          <AdminNav />
          <main className="min-w-0 flex-1">{children}</main>
        </div>
      </AdminGate>
    </div>
  );
}
