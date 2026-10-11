"use client";

// Shows only the opaque digest; the real error message stays in the server logs.
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="mx-auto flex max-w-md flex-1 flex-col items-center justify-center gap-4 px-6 py-24 text-center">
      <h1 className="text-2xl font-semibold">Something went wrong</h1>
      <p className="text-black/60 dark:text-white/60">Please try again. If the problem continues, contact support.</p>
      {error.digest ? <p className="font-mono text-xs text-black/40 dark:text-white/40">Reference: {error.digest}</p> : null}
      <button type="button" onClick={reset} className="rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background">
        Try again
      </button>
    </main>
  );
}
