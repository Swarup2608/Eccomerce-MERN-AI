"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { FormError, FormField, SubmitButton } from "@/components/form-field";
import { errorMessage, login } from "@/lib/auth";

export function LoginForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setPending(true);
    setError(null);
    try {
      await login(String(form.get("email") ?? ""), String(form.get("password") ?? ""));
      // Fixed destination only: never redirect to a URL taken from the query string (open redirect).
      router.replace("/");
    } catch (err) {
      setError(errorMessage(err));
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <FormError message={error} />
      <FormField label="Email" name="email" type="email" autoComplete="username" required maxLength={254} />
      <FormField label="Password" name="password" type="password" autoComplete="current-password" required maxLength={128} />
      <SubmitButton pending={pending}>Sign in</SubmitButton>
    </form>
  );
}
