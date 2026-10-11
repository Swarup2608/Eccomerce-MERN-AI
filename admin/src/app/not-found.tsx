import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto flex max-w-md flex-1 flex-col items-center justify-center gap-4 px-6 py-24 text-center">
      <h1 className="text-2xl font-semibold">Page not found</h1>
      <p className="text-black/60 dark:text-white/60">This page does not exist.</p>
      <Link href="/" className="rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background">
        Back to dashboard
      </Link>
    </main>
  );
}
