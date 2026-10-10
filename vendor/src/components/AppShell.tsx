"use client";

import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { FiLogOut } from "react-icons/fi";
import BrandMark from "@/components/BrandMark";
import { useAuth } from "@/providers/AuthProvider";

// Signed-in frame for every seller page; unauthenticated visitors go to /login.
export default function AppShell({ children, nav }: { children: ReactNode; nav?: ReactNode }) {
  const router = useRouter();
  const { user, isLoading, signOut } = useAuth();

  useEffect(() => {
    if (!isLoading && !user) {
      router.replace("/login");
    }
  }, [isLoading, user, router]);

  if (isLoading || !user) {
    return <PageSpinner label="Loading your seller account…" />;
  }

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-30 border-b border-border bg-surface/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-3 sm:px-6">
          <BrandMark />
          {nav && <nav className="ml-6 hidden items-center gap-1 lg:flex">{nav}</nav>}
          <div className="ml-auto flex items-center gap-3">
            <span className="hidden text-right text-sm sm:block">
              <span className="block font-semibold">
                {user.firstName} {user.lastName}
              </span>
              <span className="block text-xs text-muted">{user.email}</span>
            </span>
            <button
              type="button"
              className="btn-secondary px-3"
              onClick={async () => {
                await signOut();
                router.replace("/login");
              }}
            >
              <FiLogOut size={16} />
              <span className="hidden sm:inline">Sign out</span>
            </button>
          </div>
        </div>
        {nav && <nav className="flex gap-1 overflow-x-auto border-t border-border px-4 py-2 lg:hidden">{nav}</nav>}
      </header>
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6">{children}</main>
    </div>
  );
}

export function PageSpinner({ label }: { label: string }) {
  return (
    <div role="status" className="flex flex-1 items-center justify-center py-24 text-sm text-muted">
      <span className="mr-3 h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      {label}
    </div>
  );
}
