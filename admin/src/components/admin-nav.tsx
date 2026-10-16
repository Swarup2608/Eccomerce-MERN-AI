"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Dashboard", icon: "M3 13h8V3H3zm0 8h8v-6H3zm10 0h8V11h-8zm0-18v6h8V3z" },
  { href: "/orders", label: "Orders", icon: "M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4zM3 6h18M16 10a4 4 0 0 1-8 0" },
  { href: "/products", label: "Products", icon: "m21 8-9-5-9 5v8l9 5 9-5zM3 8l9 5 9-5M12 13v8" },
  { href: "/sales", label: "Sales", icon: "M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L2 12V2h10l8.6 8.6a2 2 0 0 1 0 2.8zM7 7h.01" },
  { href: "/categories", label: "Categories", icon: "M4 6h16M4 12h16M4 18h10" },
  { href: "/customers", label: "Customers", icon: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8" },
];

export function AdminNav() {
  const pathname = usePathname();
  const active = (href: string) => (href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`));
  return (
    <nav aria-label="Console" className="flex gap-1 overflow-x-auto md:flex-col">
      {LINKS.map((link) => (
        <Link
          key={link.href}
          href={link.href}
          aria-current={active(link.href) ? "page" : undefined}
          className={`flex items-center gap-3 whitespace-nowrap border-l-2 px-4 py-2.5 text-sm no-underline transition ${active(link.href) ? "border-accent bg-background/10 font-semibold text-background" : "border-transparent text-background/65 hover:bg-background/5 hover:text-background"}`}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d={link.icon} />
          </svg>
          {link.label}
        </Link>
      ))}
    </nav>
  );
}
