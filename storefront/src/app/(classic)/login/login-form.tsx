"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { FormError, FormField, PasswordField, SubmitButton } from "@/components/form-field";
import { ApiError } from "@/lib/api";
import { errorMessage, login, resendLoginCode, resendVerification, verifyLoginCode } from "@/lib/auth";
import { setSession } from "@/lib/session";
import { mergeGuestCart } from "@/lib/cart";
import { useBasePath, useHref } from "@/lib/base-path";

// Where to go after signing in. Only these fixed paths are accepted from ?next= (anything else would be an open redirect).
const RETURN_PATHS = new Set(["/checkout", "/cart", "/account/wishlist", "/account/orders"]);

function afterLoginPath(base: string): string {
  const next = new URLSearchParams(window.location.search).get("next");
  const path = next && base && next.startsWith(`${base}/`) ? next.slice(base.length) : next;
  return path && RETURN_PATHS.has(path) ? `${base}${path}` : `${base}/account`;
}

export function LoginForm() {
  const base = useBasePath();
  const to = useHref();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [unverifiedEmail, setUnverifiedEmail] = useState<string | null>(null);
  const [blocked, setBlocked] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [challengeId, setChallengeId] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setPending(true);
    setError(null);
    setNotice(null);
    setUnverifiedEmail(null);
    setBlocked(false);
    const identifier = String(form.get("identifier") ?? "");
    try {
      if (challengeId) {
        setSession(await verifyLoginCode(challengeId, String(form.get("code") ?? "").trim()));
      } else {
        const result = await login(identifier, String(form.get("password") ?? ""));
        if ("challengeId" in result) {
          setChallengeId(result.challengeId);
          setPending(false);
          return;
        }
        setSession(result);
      }
      // The guest cart joins the account cart before leaving the page.
      await mergeGuestCart();
      router.replace(afterLoginPath(base));
    } catch (err) {
      setError(errorMessage(err));
      if (err instanceof ApiError && err.code === "EMAIL_NOT_VERIFIED" && identifier.includes("@")) setUnverifiedEmail(identifier.trim());
      if (err instanceof ApiError && err.code === "ACCOUNT_BLOCKED") {
        // A block ends the code step too: the challenge is gone, so go back to the password form with the reset link.
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

  async function resend(email: string) {
    setPending(true);
    try {
      await resendVerification(email);
      setError(null);
      setNotice("If a verification is still pending, we sent a new link. Check your inbox.");
    } catch (err) {
      setError(errorMessage(err));
    }
    setPending(false);
  }

  if (challengeId) {
    return (
      <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        <p className="text-sm text-foreground/60">We emailed you a 6-digit code. It works once and expires in 5 minutes. Three wrong codes block your account for 24 hours.</p>
        <FormError message={error} />
        {notice ? <p role="status" className="text-sm text-foreground/70">{notice}</p> : null}
        <FormField label="Sign-in code" name="code" inputMode="numeric" autoComplete="one-time-code" required minLength={6} maxLength={6} />
        <SubmitButton pending={pending}>Verify and sign in</SubmitButton>
        <div className="flex justify-between text-sm">
          <button type="button" disabled={pending} onClick={() => resendCode(challengeId)} className="btn btn-ghost">
            Email me a new code
          </button>
          <button type="button" onClick={() => { setChallengeId(null); setError(null); setNotice(null); }} className="btn btn-ghost">
            Start over
          </button>
        </div>
      </form>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <FormError message={error} />
      {notice ? <p className="text-sm text-foreground/70">{notice}</p> : null}
      {blocked ? (
        <Link href={to("/forgot-password")} className="self-start text-sm font-medium underline">
          Reset your password to unblock your account
        </Link>
      ) : null}
      {unverifiedEmail ? (
        <button type="button" disabled={pending} onClick={() => resend(unverifiedEmail)} className="btn btn-ghost self-start">
          Resend verification email
        </button>
      ) : null}
      <FormField label="Email or username" name="identifier" autoComplete="username" required maxLength={254} />
      <PasswordField label="Password" name="password" autoComplete="current-password" required maxLength={128} />
      <Link href={to("/forgot-password")} className="-mt-2 self-end text-xs">
        Forgot password?
      </Link>
      <SubmitButton pending={pending}>Sign in</SubmitButton>
    </form>
  );
}
