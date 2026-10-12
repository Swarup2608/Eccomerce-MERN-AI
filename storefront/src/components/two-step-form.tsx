"use client";

import { useState, type FormEvent } from "react";
import { FormError, FormField, SubmitButton } from "@/components/form-field";
import { errorMessage, setTwoStep, type User } from "@/lib/auth";

// Turning two-step sign-in on or off needs the current password, so a hijacked session alone can't switch it off.
export function TwoStepForm({ enabled, onChanged }: { enabled: boolean; onChanged: (user: User) => void }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    setPending(true);
    setError(null);
    try {
      onChanged(await setTwoStep(!enabled, String(new FormData(formElement).get("currentPassword") ?? "")));
      formElement.reset();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex max-w-sm flex-col gap-4" noValidate>
      <FormError message={error} />
      <FormField label="Current password" name="currentPassword" type="password" autoComplete="current-password" required maxLength={128} />
      <SubmitButton pending={pending}>{enabled ? "Turn off two-step sign-in" : "Turn on two-step sign-in"}</SubmitButton>
    </form>
  );
}
