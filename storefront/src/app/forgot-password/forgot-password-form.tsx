"use client";

import { useState, type FormEvent } from "react";
import { FormError, FormField, SubmitButton } from "@/components/form-field";
import { errorMessage, forgotPassword } from "@/lib/auth";

export function ForgotPasswordForm() {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const email = String(new FormData(event.currentTarget).get("email") ?? "").trim();
    setPending(true);
    setError(null);
    try {
      await forgotPassword(email);
      setSent(true);
    } catch (err) {
      setError(errorMessage(err));
      setPending(false);
    }
  }

  // The same message appears whether or not the email has an account.
  if (sent) return <p className="rounded-lg border border-black/10 p-5 text-sm dark:border-white/10">If that email has an account, a reset link is on its way. It works once and expires in an hour.</p>;

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <FormError message={error} />
      <FormField label="Email" name="email" type="email" autoComplete="email" required maxLength={254} />
      <SubmitButton pending={pending}>Send reset link</SubmitButton>
    </form>
  );
}
