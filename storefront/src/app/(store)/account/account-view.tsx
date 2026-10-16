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
import { AccountTabs } from "@/components/signed-in";
import { Loading, PageTitle, eyebrowClass } from "@/components/ui";

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
        <button type="button" onClick={retry} className="btn btn-secondary">
          Try again
        </button>
      </div>
    );
  }
  if (!user) return <Loading label="Loading your account..." />;

  const rows: [string, string][] = [
    ["Name", `${user.firstName} ${user.lastName}`],
    ["Username", user.userName],
    ["Email", user.email],
    ["Mobile", user.phoneNumber ? `${user.phoneNumber}${user.phoneVerified ? "" : " (unverified)"}` : "Not added"],
  ];

  return (
    <div className="flex flex-col gap-12">
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <span className={eyebrowClass}>Your account</span>
          <PageTitle>Hi, {user.firstName}.</PageTitle>
        </div>
        <AccountTabs />
      </div>

      <FormError message={error} />

      <nav aria-label="Account shortcuts" className="grid border-l border-t border-divider sm:grid-cols-3">
        {[
          { href: "/account/orders", title: "Orders", text: "Track, pay for or cancel orders" },
          { href: "/account/wishlist", title: "Saved items", text: "Products you’re keeping an eye on" },
          { href: "/account/addresses", title: "Addresses", text: "Where we deliver to" },
        ].map((link) => (
          <Link key={link.href} href={link.href} className="flex flex-col gap-1 border-b border-r border-divider p-5 no-underline transition-colors hover:bg-accent/[0.08] hover:text-foreground">
            <span className="font-heading text-[22px]">{link.title}</span>
            <span className="text-[13px] opacity-65">{link.text}</span>
            <span className="mt-2 text-[13px] text-accent-700">Open →</span>
          </Link>
        ))}
      </nav>

      <div className="grid gap-12 lg:grid-cols-2">
        <section className="flex flex-col gap-4">
          <h2 className={eyebrowClass}>Profile</h2>
          <dl className="border-t border-divider">
            {rows.map(([label, value]) => (
              <div key={label} className="flex justify-between gap-4 border-b border-divider py-3.5 text-sm">
                <dt className="text-foreground/60">{label}</dt>
                <dd className="text-right font-medium">{value}</dd>
              </div>
            ))}
          </dl>
          <div className="mt-2 flex flex-wrap gap-3">
            <button type="button" disabled={pending} onClick={() => signOut(false)} className="btn btn-primary">
              Sign out
            </button>
            <button type="button" disabled={pending} onClick={() => signOut(true)} className="btn btn-secondary">
              Sign out of all devices
            </button>
          </div>
        </section>

        <div className="flex flex-col gap-10">
          <section className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-3">
              <h2 className="m-0 text-2xl">Two-step sign-in</h2>
              <span className={user.mfaEnabled ? "tag tag-accent" : "tag tag-outline"}>{user.mfaEnabled ? "On" : "Off"}</span>
            </div>
            <p className="m-0 text-sm text-foreground/60">{user.mfaEnabled ? "Signing in also needs a code we email you." : "Your password alone signs you in. Turn this on to also require a code we email you."}</p>
            <TwoStepForm enabled={user.mfaEnabled} onChanged={(updated) => { setUser(updated); setSession(updated); }} />
          </section>

          <section className="flex flex-col gap-4 border-t border-divider pt-8">
            <h2 className="m-0 text-2xl">Change password</h2>
            <ChangePasswordForm />
          </section>
        </div>
      </div>
    </div>
  );
}
