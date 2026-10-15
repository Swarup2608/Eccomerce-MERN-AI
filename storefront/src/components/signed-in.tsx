"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { Loading, PageTitle } from "@/components/ui";
import { useSession } from "@/lib/session";
import { useHref } from "@/lib/base-path";

// Renders account pages only for a signed-in customer and sends everyone else to sign in (and back here afterwards
// for the pages the login form allows). The API enforces this again on every request.
export function SignedIn({ next, children }: { next: string; children: ReactNode }) {
  const to = useHref();
  const router = useRouter();
  const user = useSession();
  useEffect(() => {
    if (user === null) router.replace(to(`/login?next=${encodeURIComponent(to(next))}`));
  }, [user, router, next, to]);
  if (!user) return <Loading />;
  return <>{children}</>;
}

const TABS = [
  { href: "/account", label: "Overview" },
  { href: "/account/orders", label: "Orders" },
  { href: "/account/wishlist", label: "Saved" },
  { href: "/account/addresses", label: "Addresses" },
];

export function AccountTabs() {
  const to = useHref();
  const pathname = usePathname();
  return (
    <nav aria-label="Account" className="flex gap-6 overflow-x-auto border-b border-divider">
      {TABS.map((tab) => {
        const href = to(tab.href);
        const active = tab.href === "/account" ? pathname === href : pathname.startsWith(href);
        return (
          <Link key={tab.href} href={href} aria-current={active ? "page" : undefined} className={`-mb-px whitespace-nowrap border-b-2 pb-3 text-[15px] font-medium no-underline ${active ? "border-accent text-foreground" : "border-transparent text-foreground/60 hover:text-foreground"}`}>
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function AccountShell({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <div>
      <div className="mb-7 flex flex-col gap-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <PageTitle>{title}</PageTitle>
          {aside ? <span className="text-sm opacity-65">{aside}</span> : null}
        </div>
        <AccountTabs />
      </div>
      {children}
    </div>
  );
}
