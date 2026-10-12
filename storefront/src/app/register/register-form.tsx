"use client";

import { useState, type FormEvent } from "react";
import { FormError, FormField, SubmitButton } from "@/components/form-field";
import { errorMessage, register } from "@/lib/auth";

export function RegisterForm() {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const field = (name: string) => String(form.get(name) ?? "").trim();

    if (form.get("password") !== form.get("confirmPassword")) {
      setError("Passwords do not match.");
      return;
    }

    setPending(true);
    setError(null);
    try {
      const phoneNumber = field("phoneNumber");
      await register({ firstName: field("firstName"), lastName: field("lastName"), email: field("email"), userName: field("userName"), password: String(form.get("password") ?? ""), ...(phoneNumber ? { phoneNumber } : {}) });
      setSentTo(field("email"));
    } catch (err) {
      setError(errorMessage(err));
      setPending(false);
    }
  }

  if (sentTo) {
    return (
      <div className="rounded-lg border border-black/10 p-5 text-sm dark:border-white/10">
        <h2 className="font-medium">Check your email</h2>
        <p className="mt-2 text-black/60 dark:text-white/60">If {sentTo} can be used for a new account, we have sent a verification link to it. Open it to finish creating your account, then sign in.</p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <FormError message={error} />
      <div className="grid grid-cols-2 gap-4">
        <FormField label="First name" name="firstName" autoComplete="given-name" required maxLength={50} />
        <FormField label="Last name" name="lastName" autoComplete="family-name" required maxLength={50} />
      </div>
      <FormField label="Email" name="email" type="email" autoComplete="email" required maxLength={254} />
      <FormField label="Username" name="userName" autoComplete="username" required minLength={3} maxLength={30} hint="Letters, numbers, hyphens and underscores." />
      <FormField label="Mobile number (optional)" name="phoneNumber" type="tel" autoComplete="tel" maxLength={16} placeholder="+919876543210" hint="International format, starting with +." />
      <FormField label="Password" name="password" type="password" autoComplete="new-password" required minLength={8} maxLength={128} hint="8+ characters with an uppercase letter, lowercase letter, number and special character." />
      <FormField label="Confirm password" name="confirmPassword" type="password" autoComplete="new-password" required maxLength={128} />
      <SubmitButton pending={pending}>Create account</SubmitButton>
    </form>
  );
}
