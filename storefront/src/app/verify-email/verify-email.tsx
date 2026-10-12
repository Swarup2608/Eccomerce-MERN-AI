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

  if (state === "working") return <p className="text-sm text-black/60 dark:text-white/60">Verifying your email...</p>;
  if (state !== "done") return <FormError message={state.error} />;
  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Email verified</h1>
      <p className="mt-2 text-sm text-black/60 dark:text-white/60">
        Your account is ready.{" "}
        <Link href="/login" className="font-medium underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}
