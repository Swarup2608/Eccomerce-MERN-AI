"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { FormError } from "@/components/form-field";
import { errorMessage, getCurrentAdmin, logout, type AdminUser } from "@/lib/auth";

// Renders admin UI only for a signed-in admin. Every admin API route enforces this again server-side;
// this gate only decides what the browser shows.
export function AdminGate({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [admin, setAdmin] = useState<AdminUser | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    let active = true;
    getCurrentAdmin()
      .then((current) => {
        if (!active) return;
        if (current) setAdmin(current);
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

  if (error) return <div className="mx-auto w-full max-w-md px-6 py-24"><FormError message={error} /></div>;
  if (!admin) return <p className="px-6 py-24 text-center text-sm text-black/60 dark:text-white/60">Checking your session...</p>;

  return (
    <>
      <div className="border-b border-black/10 bg-black/[0.02] dark:border-white/10 dark:bg-white/[0.03]">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-6 py-2 text-sm">
          <span>
            Signed in as <span className="font-medium">{admin.firstName} {admin.lastName}</span> ({admin.email})
          </span>
          <span className="flex gap-3">
            <button type="button" disabled={pending} onClick={() => signOut(false)} className="font-medium hover:underline disabled:opacity-60">
              Sign out
            </button>
            <button type="button" disabled={pending} onClick={() => signOut(true)} className="text-black/60 hover:underline disabled:opacity-60 dark:text-white/60">
              Sign out everywhere
            </button>
          </span>
        </div>
      </div>
      {children}
    </>
  );
}
