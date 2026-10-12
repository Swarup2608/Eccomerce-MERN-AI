"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Dashboard" },
  { href: "/orders", label: "Orders" },
  { href: "/products", label: "Products" },
  { href: "/categories", label: "Categories" },
  { href: "/customers", label: "Customers" },
];

export function AdminNav() {
  const pathname = usePathname();
  const active = (href: string) => (href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`));
  return (
    <nav aria-label="Console" className="flex gap-1 overflow-x-auto md:w-44 md:shrink-0 md:flex-col">
      {LINKS.map((link) => (
        <Link
          key={link.href}
          href={link.href}
          aria-current={active(link.href) ? "page" : undefined}
          className={`whitespace-nowrap rounded-md px-3 py-2 text-sm ${active(link.href) ? "bg-black/[0.06] font-medium dark:bg-white/10" : "text-black/60 hover:bg-black/[0.03] dark:text-white/60 dark:hover:bg-white/5"}`}
        >
          {link.label}
        </Link>
      ))}
    </nav>
  );
}
