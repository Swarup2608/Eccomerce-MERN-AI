"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { PageTitle } from "@/components/ui";
import { formatInr } from "@/lib/money";
import { stylistApi, type Feedback, type Suggestion } from "@/lib/stylist";

const TABS = [
  { href: "/stylist", label: "Ask the stylist" },
  { href: "/stylist/chat", label: "Chat" },
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

// Likes nudge future picks towards similar pieces; a disliked product is never suggested again. Pressing the active choice clears it.
function FeedbackButtons({ productId }: { productId: string }) {
  const [value, setValue] = useState<Feedback | null>(null);
  const [busy, setBusy] = useState(false);
  async function choose(next: Feedback) {
    const target = value === next ? null : next;
    setBusy(true);
    try {
      await stylistApi.feedback(productId, target ?? "clear");
      setValue(target);
    } catch {
      // Feedback is a nicety; leave the buttons as they were.
    }
    setBusy(false);
  }
  const cls = (on: boolean) => `min-h-9 border px-3 text-xs font-medium disabled:opacity-50 ${on ? "border-foreground bg-foreground text-background" : "border-foreground/20 hover:border-foreground"}`;
  return (
    <div className="mt-2 flex gap-2" role="group" aria-label="Tell the stylist">
      <button type="button" className={cls(value === "like")} aria-pressed={value === "like"} disabled={busy} onClick={() => choose("like")}>More like this</button>
      <button type="button" className={cls(value === "dislike")} aria-pressed={value === "dislike"} disabled={busy} onClick={() => choose("dislike")}>Not for me</button>
    </div>
  );
}

export function ProductLink({ s, feedback = false }: { s: Suggestion; feedback?: boolean }) {
  const body = (
    <>
      <Thumb src={s.image} label={s.title} />
      <span className="mt-2 block truncate text-sm font-semibold">{s.title}</span>
      <span className="block text-sm tabular-nums">{s.price !== undefined ? formatInr(s.price) : null}{s.brand ? <span className="text-foreground/60"> · {s.brand}</span> : null}</span>
    </>
  );
  return (
    <article className="flex min-w-0 flex-col">
      {s.slug ? <Link href={`/products/${s.slug}`} className="no-underline hover:text-accent-700">{body}</Link> : body}
      {s.reasons.length ? <ul className="m-0 mt-1.5 list-none p-0 text-xs text-foreground/65">{s.reasons.slice(0, 3).map((r) => <li key={r}>{r}</li>)}</ul> : null}
      {s.slug ? <Link href={`/products/${s.slug}`} className="mt-2 text-sm font-medium text-accent-700 underline underline-offset-4">View in shop</Link> : null}
      {feedback ? <FeedbackButtons productId={s.id} /> : null}
    </article>
  );
}
