"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { FormError, FormField, SubmitButton } from "@/components/form-field";
import { ApiError } from "@/lib/api";
import { errorMessage, login, resendLoginCode, verifyLoginCode } from "@/lib/auth";

export function LoginForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [blocked, setBlocked] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setPending(true);
    setError(null);
    setBlocked(false);
    setNotice(null);
    try {
      if (!challengeId) {
        setChallengeId(await login(String(form.get("email") ?? ""), String(form.get("password") ?? "")));
        setPending(false);
        return;
      }
      await verifyLoginCode(challengeId, String(form.get("code") ?? "").trim());
      // Fixed destination only: never redirect to a URL taken from the query string (open redirect).
      router.replace("/");
    } catch (err) {
      setError(errorMessage(err));
      // A block ends the code step too: the challenge is gone, so go back to the password form with the reset link.
      if (err instanceof ApiError && err.code === "ACCOUNT_BLOCKED") {
        setBlocked(true);
        setChallengeId(null);
      }
      setPending(false);
    }
  }

  async function resendCode(id: string) {
    setPending(true);
    setError(null);
    try {
      await resendLoginCode(id);
      setNotice("We emailed you a new code. Only the newest code works.");
    } catch (err) {
      setError(errorMessage(err));
      // The attempt expired: back to the password form.
      if (err instanceof ApiError && err.code === "INVALID_MFA_CODE") setChallengeId(null);
    }
    setPending(false);
  }

  if (challengeId) {
    return (
      <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        <p className="text-sm text-black/60 dark:text-white/60">We emailed you a 6-digit code. It works once and expires in 5 minutes. Three wrong codes block your account for 24 hours.</p>
        <FormError message={error} />
        {notice ? <p role="status" className="text-sm text-black/70 dark:text-white/70">{notice}</p> : null}
        <FormField label="Sign-in code" name="code" inputMode="numeric" autoComplete="one-time-code" required minLength={6} maxLength={6} />
        <SubmitButton pending={pending}>Verify and sign in</SubmitButton>
        <div className="flex justify-between text-sm">
          <button type="button" disabled={pending} onClick={() => resendCode(challengeId)} className="underline disabled:opacity-60">
            Email me a new code
          </button>
          <button type="button" onClick={() => { setChallengeId(null); setError(null); setNotice(null); }} className="underline">
            Start over
          </button>
        </div>
      </form>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <FormError message={error} />
      {blocked ? (
        <Link href="/forgot-password" className="self-start text-sm font-medium underline">
          Reset your password to unblock your account
        </Link>
      ) : null}
      <FormField label="Email" name="email" type="email" autoComplete="username" required maxLength={254} />
      <FormField label="Password" name="password" type="password" autoComplete="current-password" required maxLength={128} />
      <SubmitButton pending={pending}>Sign in</SubmitButton>
      <Link href="/forgot-password" className="text-sm underline">
        Forgot your password?
      </Link>
    </form>
  );
}
