"use client";

import { useState, type FormEvent } from "react";
import { FormError, FormField, SubmitButton } from "@/components/form-field";
import { changePassword, errorMessage } from "@/lib/auth";

export function ChangePasswordForm() {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    if (form.get("newPassword") !== form.get("confirmPassword")) return setError("Passwords do not match.");
    setPending(true);
    setError(null);
    setDone(false);
    try {
      await changePassword(String(form.get("currentPassword") ?? ""), String(form.get("newPassword") ?? ""));
      formElement.reset();
      setDone(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex max-w-sm flex-col gap-4" noValidate>
      <FormError message={error} />
      {done ? <p role="status" className="text-sm">Password changed. Your other devices were signed out.</p> : null}
      <FormField label="Current password" name="currentPassword" type="password" autoComplete="current-password" required maxLength={128} />
      <FormField label="New password" name="newPassword" type="password" autoComplete="new-password" required minLength={8} maxLength={128} hint="8+ characters with an uppercase letter, lowercase letter, number and special character." />
      <FormField label="Confirm new password" name="confirmPassword" type="password" autoComplete="new-password" required maxLength={128} />
      <SubmitButton pending={pending}>Change password</SubmitButton>
    </form>
  );
}
