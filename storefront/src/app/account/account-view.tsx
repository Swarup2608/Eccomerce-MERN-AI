"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { FormError } from "@/components/form-field";
import { errorMessage, getCurrentUser, logout, type User } from "@/lib/auth";

// The API is the real gatekeeper; this only decides what to render.
export function AccountView() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    let active = true;
    getCurrentUser()
      .then((current) => {
        if (!active) return;
        if (current) setUser(current);
        else router.replace("/login");
      })
      .catch((err: unknown) => active && setError(errorMessage(err)));
    return () => {
      active = false;
    };
  }, [router]);

  async function signOut(everywhere: boolean) {
    setPending(true);
    try {
      await logout(everywhere);
      router.replace("/login");
    } catch (err) {
      setError(errorMessage(err));
      setPending(false);
    }
  }

  if (error) return <FormError message={error} />;
  if (!user) return <p className="text-sm text-black/60 dark:text-white/60">Loading your account...</p>;

  const rows: [string, string][] = [
    ["Name", `${user.firstName} ${user.lastName}`],
    ["Username", user.userName],
    ["Email", `${user.email}${user.emailVerified ? "" : " (unverified)"}`],
    ["Mobile", user.phoneNumber ? `${user.phoneNumber}${user.phoneVerified ? "" : " (unverified)"}` : "Not added"],
  ];

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Hi, {user.firstName}</h1>
        <p className="mt-1 text-sm text-black/60 dark:text-white/60">Manage your profile and sessions.</p>
      </div>

      <dl className="divide-y divide-black/10 rounded-lg border border-black/10 dark:divide-white/10 dark:border-white/10">
        {rows.map(([label, value]) => (
          <div key={label} className="flex justify-between gap-4 px-4 py-3 text-sm">
            <dt className="text-black/60 dark:text-white/60">{label}</dt>
            <dd className="text-right font-medium">{value}</dd>
          </div>
        ))}
      </dl>

      <div className="flex flex-wrap gap-3">
        <button type="button" disabled={pending} onClick={() => signOut(false)} className="rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background disabled:opacity-60">
          Sign out
        </button>
        <button type="button" disabled={pending} onClick={() => signOut(true)} className="rounded-md border border-black/15 px-4 py-2 text-sm font-medium disabled:opacity-60 dark:border-white/20">
          Sign out of all devices
        </button>
      </div>
    </div>
  );
}
