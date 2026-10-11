import { StatusBadge } from "@/components/status-badge";
import { getBackendStatus } from "@/lib/api";

export default async function HomePage() {
  const status = await getBackendStatus();

  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b border-black/10 dark:border-white/10">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <span className="text-lg font-semibold tracking-tight">Storefront</span>
          <StatusBadge status={status} />
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col justify-center gap-6 px-6 py-24">
        <p className="text-sm font-medium uppercase tracking-widest text-black/50 dark:text-white/50">New season</p>
        <h1 className="max-w-2xl text-4xl font-semibold tracking-tight sm:text-5xl">Everything you need, delivered fast.</h1>
        <p className="max-w-xl text-lg text-black/60 dark:text-white/60">Browse curated products, check out securely, and track every order in one place.</p>
      </main>

      <footer className="border-t border-black/10 py-6 text-center text-sm text-black/50 dark:border-white/10 dark:text-white/50">
        &copy; {new Date().getFullYear()} Storefront
      </footer>
    </div>
  );
}
