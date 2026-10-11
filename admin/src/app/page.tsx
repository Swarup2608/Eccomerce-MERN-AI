import { StatusBadge } from "@/components/status-badge";
import { getBackendStatus } from "@/lib/api";

const SECTIONS = [
  { title: "Orders", description: "Review, fulfil and refund customer orders." },
  { title: "Products", description: "Manage catalogue, pricing and inventory." },
  { title: "Customers", description: "Look up accounts and order history." },
  { title: "Vendors", description: "Approve and manage marketplace sellers." },
];

export default async function DashboardPage() {
  const status = await getBackendStatus();

  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b border-black/10 dark:border-white/10">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <span className="text-lg font-semibold tracking-tight">Admin Console</span>
          <StatusBadge status={status} />
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-12">
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="mt-1 text-black/60 dark:text-white/60">Overview of your store operations.</p>

        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {SECTIONS.map((section) => (
            <section key={section.title} className="rounded-lg border border-black/10 p-5 dark:border-white/10">
              <h2 className="font-medium">{section.title}</h2>
              <p className="mt-2 text-sm text-black/60 dark:text-white/60">{section.description}</p>
            </section>
          ))}
        </div>
      </main>
    </div>
  );
}
