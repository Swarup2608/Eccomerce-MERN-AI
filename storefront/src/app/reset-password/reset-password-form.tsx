"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { FormError, FormField, SubmitButton } from "@/components/form-field";
import { errorMessage, resetPassword } from "@/lib/auth";

export function ResetPasswordForm() {
  const token = useSearchParams().get("token");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    if (form.get("password") !== form.get("confirmPassword")) return setError("Passwords do not match.");
    setPending(true);
    setError(null);
    try {
      await resetPassword(token ?? "", String(form.get("password") ?? ""));
      setDone(true);
    } catch (err) {
      setError(errorMessage(err));
      setPending(false);
    }
  }

  if (!token) return <FormError message="This link is missing its token. Request a new one." />;
  if (done) {
    return (
      <p className="text-sm">
        Your password was changed and you were signed out everywhere.{" "}
        <Link href="/login" className="font-medium underline">
          Sign in
        </Link>
      </p>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <FormError message={error} />
      <FormField label="New password" name="password" type="password" autoComplete="new-password" required minLength={8} maxLength={128} hint="8+ characters with an uppercase letter, lowercase letter, number and special character." />
      <FormField label="Confirm new password" name="confirmPassword" type="password" autoComplete="new-password" required maxLength={128} />
      <SubmitButton pending={pending}>Change password</SubmitButton>
    </form>
  );
}
