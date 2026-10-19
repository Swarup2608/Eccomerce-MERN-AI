"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { PageTitle } from "@/components/ui";

const TABS = [
  { href: "/stylist", label: "Ask the stylist" },
  { href: "/stylist/wardrobe", label: "My wardrobe" },
];

export function StylistShell({ title, children }: { title: string; children: ReactNode }) {
  const pathname = usePathname();
  return (
    <div>
      <div className="mb-7 flex flex-col gap-6">
        <PageTitle>{title}</PageTitle>
        <nav aria-label="Stylist" className="flex gap-6 overflow-x-auto border-b border-divider">
          {TABS.map((tab) => {
            const active = pathname === tab.href;
            return (
              <Link key={tab.href} href={tab.href} aria-current={active ? "page" : undefined} className={`-mb-px whitespace-nowrap border-b-2 pb-3 text-[15px] font-medium no-underline ${active ? "border-accent text-foreground" : "border-transparent text-foreground/60 hover:text-foreground"}`}>
                {tab.label}
              </Link>
            );
          })}
        </nav>
      </div>
      {children}
    </div>
  );
}

// A photo as a CSS background, like the product cards (keeps to the CSP and needs no <img> sizing).
export function Thumb({ src, label, ratio = "4/5" }: { src: string | null; label: string; ratio?: string }) {
  return (
    <span role="img" aria-label={label} className="block w-full bg-surface" style={{ aspectRatio: ratio, background: src ? `var(--color-surface) url(${JSON.stringify(src)}) center/cover no-repeat` : undefined }} />
  );
}
