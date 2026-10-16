"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { FormError } from "@/components/form-field";
import { errorMessage, verifyEmail } from "@/lib/auth";

export function VerifyEmail() {
  const token = useSearchParams().get("token");
  const [state, setState] = useState<"working" | "done" | { error: string }>(token ? "working" : { error: "This link is missing its token." });
  // The link is single use, so make exactly one request even when React re-runs the effect in development.
  const started = useRef(false);

  useEffect(() => {
    if (!token || started.current) return;
    started.current = true;
    verifyEmail(token).then(
      () => setState("done"),
      (err: unknown) => setState({ error: errorMessage(err) }),
    );
  }, [token]);

  if (state === "working") return <p className="text-sm text-foreground/60">Checking your link...</p>;
  if (state !== "done") {
    return (
      <div className="flex flex-col items-start gap-4">
        <FormError message={state.error} />
        <Link href={"/login"} className="btn btn-secondary">
          Back to sign in
        </Link>
      </div>
    );
  }
  return (
    <div className="flex flex-col items-start gap-4">
      <span className="grid size-14 place-items-center border-2 border-accent text-accent-700">
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <path d="M20 6 9 17l-5-5" />
        </svg>
      </span>
      <p className="m-0 text-sm text-foreground/70">Your email is verified and your account is ready.</p>
      <Link href={"/login"} className="btn btn-primary min-h-12 justify-between gap-8">
        <span>Sign in</span>
        <span aria-hidden>→</span>
      </Link>
    </div>
  );
}
