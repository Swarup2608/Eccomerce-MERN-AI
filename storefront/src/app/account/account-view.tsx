"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ChangePasswordForm } from "@/components/change-password-form";
import { FormError } from "@/components/form-field";
import { TwoStepForm } from "@/components/two-step-form";
import { errorMessage, getCurrentUser, logout, type User } from "@/lib/auth";
import { setSession } from "@/lib/session";
import { resetCart } from "@/lib/cart";
import Link from "next/link";

// The API is the real gatekeeper; this only decides what to render.
export function AccountView() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const load = useCallback(
    () =>
      getCurrentUser().then(
        (current) => {
          setSession(current);
          if (current) setUser(current);
          else router.replace("/login");
        },
        // Rate limits and outages are temporary: offer a retry instead of a dead end.
        (err: unknown) => setError(errorMessage(err)),
      ),
    [router],
  );

  useEffect(() => {
    void load();
  }, [load]);

  function retry() {
    setError(null);
    void load();
  }

  async function signOut(everywhere: boolean) {
    setPending(true);
    try {
      await logout(everywhere);
      setSession(null);
      resetCart();
      router.replace("/login");
    } catch (err) {
      setError(errorMessage(err));
      setPending(false);
    }
  }

  if (error && !user) {
    return (
      <div className="flex flex-col items-start gap-4">
        <FormError message={error} />
        <button type="button" onClick={retry} className="rounded-md border border-black/15 px-4 py-2 text-sm font-medium dark:border-white/20">
          Try again
        </button>
      </div>
    );
  }
  if (!user) return <p className="text-sm text-black/60 dark:text-white/60">Loading your account...</p>;

  const rows: [string, string][] = [
    ["Name", `${user.firstName} ${user.lastName}`],
    ["Username", user.userName],
    ["Email", user.email],
    ["Mobile", user.phoneNumber ? `${user.phoneNumber}${user.phoneVerified ? "" : " (unverified)"}` : "Not added"],
  ];

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Hi, {user.firstName}</h1>
        <p className="mt-1 text-sm text-black/60 dark:text-white/60">Your orders, saved items, profile and sessions.</p>
      </div>

      <FormError message={error} />

      <nav aria-label="Account" className="grid gap-3 sm:grid-cols-3">
        {[
          { href: "/account/orders", title: "Orders", text: "Track, pay for or cancel orders" },
          { href: "/account/wishlist", title: "Wishlist", text: "Products you saved for later" },
          { href: "/account/addresses", title: "Addresses", text: "Where we deliver to" },
        ].map((link) => (
          <Link key={link.href} href={link.href} className="rounded-lg border border-black/10 p-4 hover:border-black/30 dark:border-white/10 dark:hover:border-white/30">
            <p className="font-medium">{link.title}</p>
            <p className="mt-1 text-xs text-black/60 dark:text-white/60">{link.text}</p>
          </Link>
        ))}
      </nav>

      <dl className="divide-y divide-black/10 rounded-lg border border-black/10 dark:divide-white/10 dark:border-white/10">
        {rows.map(([label, value]) => (
          <div key={label} className="flex justify-between gap-4 px-4 py-3 text-sm">
            <dt className="text-black/60 dark:text-white/60">{label}</dt>
            <dd className="text-right font-medium">{value}</dd>
          </div>
        ))}
      </dl>

      <section>
        <h2 className="mb-1 text-lg font-medium">Two-step sign-in</h2>
        <p className="mb-4 text-sm text-black/60 dark:text-white/60">
          {user.mfaEnabled ? "On: signing in also needs a code we email you." : "Off: your password alone signs you in. Turn it on to also require a code we email you."}
        </p>
        <TwoStepForm enabled={user.mfaEnabled} onChanged={(updated) => { setUser(updated); setSession(updated); }} />
      </section>

      <section>
        <h2 className="mb-4 text-lg font-medium">Change password</h2>
        <ChangePasswordForm />
      </section>

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
