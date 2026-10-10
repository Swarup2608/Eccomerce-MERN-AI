"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import BrandMark from "@/components/BrandMark";
import { errorMessage } from "@/lib/api/client";
import { useAuth } from "@/providers/AuthProvider";

const STOREFRONT_URL = process.env.NEXT_PUBLIC_STOREFRONT_URL ?? "http://localhost:3000";

export default function LoginPage() {
  const router = useRouter();
  const { user, isLoading, signIn } = useAuth();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isLoading && user) {
      router.replace("/");
    }
  }, [isLoading, user, router]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      await signIn({ identifier: identifier.trim(), password });
      toast.success("Welcome back!");
      router.replace("/");
    } catch (err) {
      setError(errorMessage(err, "Unable to sign in."));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="flex flex-1 items-center justify-center px-4 py-12">
      <div className="w-full max-w-md rounded-3xl border border-border bg-surface p-8 shadow-sm">
        <BrandMark />
        <h1 className="mt-8 text-2xl font-black">Sign in to sell</h1>
        <p className="mt-2 text-sm text-muted">Use your ShopSphere account. New sellers apply from here after signing in.</p>

        <form className="mt-8 space-y-4" onSubmit={handleSubmit} noValidate>
          <label className="block text-sm font-semibold">
            Email or username
            <input className="field mt-1.5" autoComplete="username" value={identifier} onChange={(event) => setIdentifier(event.target.value)} required />
          </label>
          <label className="block text-sm font-semibold">
            Password
            <input className="field mt-1.5" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required />
          </label>

          {error && (
            <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm text-danger">
              {error}
            </p>
          )}

          <button type="submit" className="btn-primary w-full" disabled={submitting || !identifier || !password}>
            {submitting ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-muted">
          No account yet?{" "}
          <a href={`${STOREFRONT_URL}/register`} className="font-semibold text-primary hover:underline">
            Create one on ShopSphere
          </a>
        </p>
      </div>
    </main>
  );
}
