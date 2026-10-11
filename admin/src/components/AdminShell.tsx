"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { FiBox, FiClipboard, FiGrid, FiHome, FiLogOut, FiMenu, FiShield, FiShoppingBag, FiUsers, FiX } from "react-icons/fi";
import { useAuth } from "@/providers/AuthProvider";

const NAV = [
  { href: "/", label: "Overview", icon: FiHome },
  { href: "/applications", label: "Seller applications", icon: FiClipboard },
  { href: "/vendors", label: "Vendors", icon: FiShoppingBag },
  { href: "/users", label: "Users", icon: FiUsers },
  { href: "/categories", label: "Categories", icon: FiGrid },
  { href: "/products", label: "Catalog products", icon: FiBox },
];

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

// Signed-in frame for every admin page; anyone without an admin session goes to /login.
export default function AdminShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, isLoading, isSuperAdmin, signOut } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (!isLoading && !user) {
      router.replace("/login");
    }
  }, [isLoading, user, router]);

  if (isLoading || !user) {
    return <PageSpinner label="Checking your admin session…" />;
  }

  const nav = (
    <nav className="space-y-1">
      {NAV.map(({ href, label, icon: Icon }) => (
        <Link
          key={href}
          href={href}
          onClick={() => setMenuOpen(false)}
          className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition ${isActive(pathname, href) ? "bg-primary text-white" : "text-slate-600 hover:bg-teal-50 hover:text-primary"}`}
        >
          <Icon size={17} />
          {label}
        </Link>
      ))}
    </nav>
  );

  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-border bg-surface p-4 lg:flex">
        <Brand />
        <div className="mt-8 flex-1">{nav}</div>
        <UserCard name={`${user.firstName} ${user.lastName}`} email={user.email} isSuperAdmin={isSuperAdmin} onSignOut={async () => { await signOut(); router.replace("/login"); }} />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-border bg-surface px-4 py-3 lg:hidden">
          <button type="button" aria-label="Toggle navigation" className="rounded-lg p-2 hover:bg-slate-100" onClick={() => setMenuOpen((open) => !open)}>
            {menuOpen ? <FiX size={20} /> : <FiMenu size={20} />}
          </button>
          <Brand />
        </header>
        {menuOpen && (
          <div className="border-b border-border bg-surface p-4 lg:hidden">
            {nav}
            <button type="button" className="btn-secondary mt-4 w-full" onClick={async () => { await signOut(); router.replace("/login"); }}>
              <FiLogOut size={16} /> Sign out
            </button>
          </div>
        )}
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-8">{children}</main>
      </div>
    </div>
  );
}

function Brand() {
  return (
    <span className="flex items-center gap-2">
      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-white">
        <FiShield size={18} />
      </span>
      <span className="text-lg font-black tracking-tight">
        shopsphere <span className="font-semibold text-primary">admin</span>
      </span>
    </span>
  );
}

function UserCard({ name, email, isSuperAdmin, onSignOut }: { name: string; email: string; isSuperAdmin: boolean; onSignOut: () => Promise<void> }) {
  return (
    <div className="rounded-2xl border border-border p-3">
      <p className="truncate text-sm font-bold">{name}</p>
      <p className="truncate text-xs text-muted">{email}</p>
      <span className="mt-2 inline-flex rounded-full bg-teal-50 px-2 py-0.5 text-[11px] font-bold text-primary">{isSuperAdmin ? "Super Admin" : "Admin"}</span>
      <button type="button" className="btn-secondary mt-3 w-full" onClick={() => void onSignOut()}>
        <FiLogOut size={15} /> Sign out
      </button>
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
