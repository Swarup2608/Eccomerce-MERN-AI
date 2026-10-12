"use client";

import { useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { Loading } from "@/components/ui";
import { useSession } from "@/lib/session";

// Renders account pages only for a signed-in customer and sends everyone else to sign in (and back here afterwards
// for the pages the login form allows). The API enforces this again on every request.
export function SignedIn({ next, children }: { next: string; children: ReactNode }) {
  const router = useRouter();
  const user = useSession();
  useEffect(() => {
    if (user === null) router.replace(`/login?next=${encodeURIComponent(next)}`);
  }, [user, router, next]);
  if (!user) return <Loading />;
  return <>{children}</>;
}

export function AccountShell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <p className="mb-1 text-xs text-black/50 dark:text-white/50">
        <a href="/account" className="hover:underline">
          Account
        </a>
      </p>
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">{title}</h1>
      {children}
    </div>
  );
}
