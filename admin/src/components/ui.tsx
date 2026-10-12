import Link from "next/link";
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";

// Small, unstyled-by-default building blocks shared by the console pages, matching the auth screens' look.

const control = "rounded-md border border-black/15 bg-transparent px-3 py-2 text-sm outline-none focus:border-black/40 focus:ring-2 focus:ring-black/10 disabled:opacity-60 dark:border-white/20 dark:focus:border-white/50 dark:focus:ring-white/10";

export function Input({ className = "", ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`${control} ${className}`} {...props} />;
}

export function Select({ className = "", children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={`${control} bg-background ${className}`} {...props}>
      {children}
    </select>
  );
}

export function TextArea({ className = "", ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={`${control} min-h-24 ${className}`} {...props} />;
}

export function Field({ label, hint, children, className = "" }: { label: string; hint?: string; children: ReactNode; className?: string }) {
  return (
    <label className={`flex flex-col gap-1.5 text-sm ${className}`}>
      <span className="font-medium">{label}</span>
      {children}
      {hint ? <span className="text-xs text-black/50 dark:text-white/50">{hint}</span> : null}
    </label>
  );
}

type Variant = "primary" | "secondary" | "danger" | "ghost";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-foreground text-background hover:opacity-90",
  secondary: "border border-black/15 hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10",
  danger: "border border-red-500/40 text-red-700 hover:bg-red-500/10 dark:text-red-300",
  ghost: "text-black/70 hover:bg-black/5 dark:text-white/70 dark:hover:bg-white/10",
};

export function Button({ variant = "secondary", className = "", type = "button", ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return <button type={type} className={`inline-flex items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${VARIANTS[variant]} ${className}`} {...props} />;
}

export function ButtonLink({ href, children, variant = "secondary" }: { href: string; children: ReactNode; variant?: Variant }) {
  return (
    <Link href={href} className={`inline-flex items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition ${VARIANTS[variant]}`}>
      {children}
    </Link>
  );
}

export function Card({ title, actions, children, className = "" }: { title?: string; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-lg border border-black/10 dark:border-white/10 ${className}`}>
      {title || actions ? (
        <header className="flex items-center justify-between gap-3 border-b border-black/10 px-4 py-3 dark:border-white/10">
          {title ? <h2 className="text-sm font-semibold">{title}</h2> : <span />}
          {actions}
        </header>
      ) : null}
      <div className="p-4">{children}</div>
    </section>
  );
}

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description ? <p className="mt-1 text-sm text-black/60 dark:text-white/60">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}

type Tone = "neutral" | "green" | "amber" | "red" | "blue";

const TONES: Record<Tone, string> = {
  neutral: "bg-black/5 text-black/70 dark:bg-white/10 dark:text-white/70",
  green: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  amber: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  red: "bg-red-500/15 text-red-700 dark:text-red-300",
  blue: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
};

export function Badge({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${TONES[tone]}`}>{children}</span>;
}

const STATUS_TONES: Record<string, Tone> = {
  active: "green",
  draft: "neutral",
  archived: "amber",
  pending_payment: "amber",
  confirmed: "blue",
  processing: "blue",
  shipped: "blue",
  delivered: "green",
  cancelled: "red",
  returned: "amber",
  pending: "amber",
  paid: "green",
  failed: "red",
  refunded: "neutral",
  partially_refunded: "amber",
  suspended: "red",
};

export function StatusPill({ status, label }: { status: string; label?: string }) {
  return <Badge tone={STATUS_TONES[status] ?? "neutral"}>{label ?? status.replace(/_/g, " ")}</Badge>;
}

export function Table({ head, children, empty }: { head: ReactNode; children: ReactNode; empty?: boolean }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-black/10 dark:border-white/10">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead className="bg-black/[0.03] text-xs uppercase tracking-wide text-black/60 dark:bg-white/[0.04] dark:text-white/60">{head}</thead>
        <tbody className="divide-y divide-black/10 dark:divide-white/10">{children}</tbody>
      </table>
      {empty ? <p className="px-4 py-10 text-center text-sm text-black/50 dark:text-white/50">Nothing to show yet.</p> : null}
    </div>
  );
}

export function Pagination({ page, totalPages, total, onPage }: { page: number; totalPages: number; total: number; onPage: (page: number) => void }) {
  if (totalPages <= 1) return <p className="mt-3 text-xs text-black/50 dark:text-white/50">{total} result{total === 1 ? "" : "s"}</p>;
  return (
    <div className="mt-3 flex items-center justify-between text-sm">
      <span className="text-xs text-black/50 dark:text-white/50">
        Page {page} of {totalPages} · {total} results
      </span>
      <span className="flex gap-2">
        <Button disabled={page <= 1} onClick={() => onPage(page - 1)}>
          Previous
        </Button>
        <Button disabled={page >= totalPages} onClick={() => onPage(page + 1)}>
          Next
        </Button>
      </span>
    </div>
  );
}

export function Notice({ tone = "green", children }: { tone?: "green" | "amber"; children: ReactNode }) {
  const styles = tone === "green" ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200" : "border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-200";
  return (
    <p role="status" className={`rounded-md border px-3 py-2 text-sm ${styles}`}>
      {children}
    </p>
  );
}

export function Loading({ label = "Loading..." }: { label?: string }) {
  return <p className="py-10 text-center text-sm text-black/50 dark:text-white/50">{label}</p>;
}

// Product thumbnails come from the R2 public bucket. A plain <img> keeps the admin free of image-optimiser config.
export function Thumb({ src, alt, size = 40 }: { src: string | null | undefined; alt: string; size?: number }) {
  if (!src) return <span style={{ width: size, height: size }} className="inline-block rounded bg-black/5 dark:bg-white/10" aria-hidden />;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={alt} width={size} height={size} loading="lazy" className="rounded object-cover" style={{ width: size, height: size }} />;
}
