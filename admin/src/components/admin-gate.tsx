"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { ChangePasswordForm } from "@/components/change-password-form";
import { FormError } from "@/components/form-field";
import { errorMessage, getCurrentAdmin, logout, type AdminUser } from "@/lib/auth";

// Renders admin UI only for a signed-in admin. Every admin API route enforces this again server-side;
// this gate only decides what the browser shows.
//
// The auth cookies belong to the API's host, so this Next server never sees them and cannot check the session itself.
// That is why admin data must never be fetched in a server component: `children` is server-rendered and shipped to
// every visitor. Put data behind a client component that loads it with `authFetch` once this gate has let the admin in.
export function AdminGate({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [admin, setAdmin] = useState<AdminUser | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);

  const load = useCallback(
    () =>
      getCurrentAdmin().then(
        (current) => {
          if (current) setAdmin(current);
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
      router.replace("/login");
    } catch (err) {
      setError(errorMessage(err));
      setPending(false);
    }
  }

  if (error && !admin) {
    return (
      <div className="mx-auto flex w-full max-w-md flex-col items-start gap-4 px-6 py-24">
        <FormError message={error} />
        <button type="button" onClick={retry} className="rounded-md border border-black/15 px-4 py-2 text-sm font-medium dark:border-white/20">
          Try again
        </button>
      </div>
    );
  }
  if (!admin) return <p className="px-6 py-24 text-center text-sm text-black/60 dark:text-white/60">Checking your session...</p>;

  return (
    <>
      <div className="border-b border-black/10 bg-black/[0.02] dark:border-white/10 dark:bg-white/[0.03]">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-6 py-2 text-sm">
          <span>
            Signed in as <span className="font-medium">{admin.firstName} {admin.lastName}</span> ({admin.email})
          </span>
          <span className="flex gap-3">
            <button type="button" onClick={() => setChangingPassword((open) => !open)} className="text-black/60 hover:underline dark:text-white/60">
              Change password
            </button>
            <button type="button" disabled={pending} onClick={() => signOut(false)} className="font-medium hover:underline disabled:opacity-60">
              Sign out
            </button>
            <button type="button" disabled={pending} onClick={() => signOut(true)} className="text-black/60 hover:underline disabled:opacity-60 dark:text-white/60">
              Sign out everywhere
            </button>
          </span>
        </div>
      </div>
      {error ? <div className="mx-auto w-full max-w-6xl px-6 pt-4"><FormError message={error} /></div> : null}
      {changingPassword ? <div className="mx-auto w-full max-w-6xl px-6 pt-8"><ChangePasswordForm /></div> : null}
      {children}
    </>
  );
}
