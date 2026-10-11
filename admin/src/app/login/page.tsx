"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { FiShield } from "react-icons/fi";
import { errorMessage } from "@/lib/api/client";
import { useAuth } from "@/providers/AuthProvider";

type Mode = "admin" | "super_admin";

export default function LoginPage() {
  const router = useRouter();
  const { user, isLoading, signIn } = useAuth();
  const [mode, setMode] = useState<Mode>("admin");
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isLoading && user) router.replace("/");
  }, [isLoading, user, router]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await signIn(mode, identifier.trim(), password);
      toast.success("Signed in");
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
        <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary text-white">
          <FiShield size={22} />
        </span>
        <h1 className="mt-6 text-2xl font-black">ShopSphere admin</h1>
        <p className="mt-1 text-sm text-muted">Staff access only. All actions are attributed to your account.</p>

        <div role="tablist" aria-label="Sign-in type" className="mt-6 grid grid-cols-2 rounded-xl bg-slate-100 p-1 text-sm font-semibold">
          {(["admin", "super_admin"] as const).map((value) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={mode === value}
              onClick={() => {
                setMode(value);
                setError(null);
              }}
              className={`rounded-lg py-2 transition ${mode === value ? "bg-white shadow-sm" : "text-muted"}`}
            >
              {value === "admin" ? "Admin" : "Super Admin"}
            </button>
          ))}
        </div>

        <form className="mt-6 space-y-4" onSubmit={handleSubmit} noValidate>
          <label className="block text-sm font-semibold">
            {mode === "admin" ? "Email or username" : "Email"}
            <input className="field mt-1.5" type={mode === "admin" ? "text" : "email"} autoComplete="username" value={identifier} onChange={(event) => setIdentifier(event.target.value)} required />
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
      </div>
    </main>
  );
}
