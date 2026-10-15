import Link from "next/link";
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";

// Small, unstyled-by-default building blocks shared by the console pages, matching the auth screens' look.

const control = "min-h-10 border border-foreground/25 bg-background px-3 py-2 text-sm outline-none transition hover:border-foreground/50 disabled:opacity-60";

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
      {hint ? <span className="text-xs text-foreground/55">{hint}</span> : null}
    </label>
  );
}

type Variant = "primary" | "secondary" | "danger" | "ghost";

const VARIANTS: Record<Variant, string> = {
  primary: "border border-foreground bg-foreground text-background hover:border-accent-600 hover:bg-accent-600 hover:text-on-accent active:bg-accent-700",
  secondary: "border border-foreground/60 text-foreground hover:border-foreground hover:bg-foreground hover:text-background",
  danger: "border border-red-600/50 text-red-700 hover:bg-red-600/10",
  ghost: "text-foreground/70 hover:bg-foreground/5",
};

export function Button({ variant = "secondary", className = "", type = "button", ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return <button type={type} className={`inline-flex items-center justify-center gap-2 min-h-10 px-4 py-2 text-sm font-semibold transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 ${VARIANTS[variant]} ${className}`} {...props} />;
}

export function ButtonLink({ href, children, variant = "secondary" }: { href: string; children: ReactNode; variant?: Variant }) {
  return (
    <Link href={href} className={`inline-flex items-center justify-center gap-2 min-h-10 px-4 py-2 text-sm font-semibold transition active:scale-[0.98] ${VARIANTS[variant]}`}>
      {children}
    </Link>
  );
}

export function Card({ title, actions, children, className = "" }: { title?: string; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`border border-divider bg-background ${className}`}>
      {title || actions ? (
        <header className="flex items-center justify-between gap-3 border-b border-divider px-5 py-3.5">
          {title ? <h2 className="text-xs font-semibold uppercase tracking-[0.14em]">{title}</h2> : <span />}
          {actions}
        </header>
      ) : null}
      <div className="p-5">{children}</div>
    </section>
  );
}

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-[clamp(28px,3vw,40px)] font-semibold leading-none tracking-tight">{title}</h1>
        {description ? <p className="mt-2 text-sm text-foreground/60">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}

type Tone = "neutral" | "green" | "amber" | "red" | "blue";

const TONES: Record<Tone, string> = {
  neutral: "bg-foreground/[0.07] text-foreground/70",
  green: "bg-emerald-600/15 text-emerald-800",
  amber: "bg-accent/15 text-accent-700",
  red: "bg-red-600/15 text-red-800",
  blue: "bg-sky-600/15 text-sky-800",
};

export function Badge({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  return <span className={`inline-flex items-center px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider ${TONES[tone]}`}>{children}</span>;
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
    <div className="overflow-x-auto border border-divider bg-background">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead className="bg-surface text-[11px] font-semibold uppercase tracking-[0.12em] text-foreground/65">{head}</thead>
        <tbody className="divide-y divide-divider [&_tr:hover]:bg-surface/50">{children}</tbody>
      </table>
      {empty ? <p className="px-4 py-10 text-center text-sm text-foreground/55">Nothing to show yet.</p> : null}
    </div>
  );
}

export function Pagination({ page, totalPages, total, onPage }: { page: number; totalPages: number; total: number; onPage: (page: number) => void }) {
  if (totalPages <= 1) return <p className="mt-3 text-xs text-foreground/55">{total} result{total === 1 ? "" : "s"}</p>;
  return (
    <div className="mt-3 flex items-center justify-between text-sm">
      <span className="text-xs text-foreground/55">
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
  const styles = tone === "green" ? "border-emerald-600 bg-emerald-600/10 text-emerald-900" : "border-accent bg-accent/10 text-accent-700";
  return (
    <p role="status" className={`border-l-2 px-3 py-2 text-sm ${styles}`}>
      {children}
    </p>
  );
}

export function Loading({ label = "Loading..." }: { label?: string }) {
  return <p className="py-10 text-center text-sm text-foreground/55">{label}</p>;
}

// Product thumbnails come from the R2 public bucket. A plain <img> keeps the admin free of image-optimiser config.
export function Thumb({ src, alt, size = 40 }: { src: string | null | undefined; alt: string; size?: number }) {
  if (!src) return <span style={{ width: size, height: size }} className="inline-block bg-surface" aria-hidden />;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={alt} width={size} height={size} loading="lazy" className="object-cover" style={{ width: size, height: size }} />;
}
