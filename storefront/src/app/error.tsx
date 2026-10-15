"use client";

import Link from "next/link";

// Shows only the opaque digest; the real error message stays in the server logs.
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="mx-auto flex w-full max-w-[1080px] flex-1 flex-col items-start justify-center gap-5 px-6 py-24 sm:px-8">
      <span className="text-xs uppercase tracking-[0.14em] text-accent-700">Something went wrong</span>
      <h1 className="m-0 text-[clamp(48px,6.4vw,96px)] leading-[0.92] tracking-[-0.02em]">We hit a snag.</h1>
      <p className="m-0 max-w-[520px] text-[17px] text-foreground/65">Please try again. If the problem continues, contact support.</p>
      {error.digest ? <p className="m-0 font-mono text-xs text-foreground/45">Reference: {error.digest}</p> : null}
      <div className="flex flex-wrap gap-3">
        <button type="button" onClick={reset} className="btn btn-primary min-h-[52px] min-w-[200px] justify-between text-base">
          <span>Try again</span>
          <span aria-hidden>→</span>
        </button>
        <Link href="/" className="btn btn-secondary min-h-[52px] text-base">
          Home
        </Link>
      </div>
    </main>
  );
}
