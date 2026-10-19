import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from "react";

const control = "min-h-11 border border-foreground/25 bg-background px-3 py-2 text-sm outline-none transition hover:border-foreground/50 disabled:opacity-60";

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
  secondary: "border border-foreground text-foreground hover:bg-foreground hover:text-background",
  danger: "border border-accent-700 text-accent-700 hover:bg-accent-700 hover:text-on-accent",
  ghost: "text-foreground/70 underline decoration-1 underline-offset-4 hover:text-accent-700",
};

export const buttonClass = (variant: Variant = "secondary"): string => `inline-flex min-h-11 items-center justify-center gap-2 px-5 py-2 text-sm font-semibold tracking-[0.01em] transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 ${VARIANTS[variant]}`;

export function Button({ variant = "secondary", className = "", type = "button", ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return <button type={type} className={`${buttonClass(variant)} ${className}`} {...props} />;
}

export function Notice({ tone = "green", children }: { tone?: "green" | "amber"; children: ReactNode }) {
  const styles = tone === "green" ? "border-foreground bg-surface text-foreground" : "border-accent bg-accent/10 text-accent-700";
  return (
    <p role="status" className={`border-l-2 px-4 py-3 text-sm ${styles}`}>
      {children}
    </p>
  );
}

export function Loading({ label = "Loading..." }: { label?: string }) {
  return (
    <p className="flex items-center justify-center gap-3 py-20 text-sm text-foreground/55">
      <span aria-hidden className="size-2.5 rotate-45 animate-pulse border-2 border-accent" />
      {label}
    </p>
  );
}

export const eyebrowClass = "text-xs uppercase tracking-[0.14em] text-accent-700";

// Big Swiss page title with an optional muted count, as on the design's Bag / Orders screens.
export function PageTitle({ children, count, className = "" }: { children: ReactNode; count?: ReactNode; className?: string }) {
  return (
    <h1 className={`m-0 text-[clamp(40px,5vw,72px)] leading-none ${className}`}>
      {children}
      {count !== undefined ? <span className="ml-3 align-baseline font-sans text-[0.4em] font-normal tracking-normal opacity-50">{count}</span> : null}
    </h1>
  );
}

export function EmptyState({ title, text, children }: { title: string; text: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-start gap-3 border border-dashed border-divider px-8 py-16">
      <h3 className="m-0 text-3xl">{title}</h3>
      <p className="m-0 text-foreground/65">{text}</p>
      {children ? <div className="mt-1 flex flex-wrap gap-2.5">{children}</div> : null}
    </div>
  );
}

// Product photos come from the R2 public bucket. A plain <img> (lazy, fixed aspect ratio) keeps the CSP simple.
export function ProductPhoto({ src, alt, className = "", eager = false }: { src: string | null | undefined; alt: string; className?: string; eager?: boolean }) {
  if (!src) return <div className={`flex items-center justify-center bg-surface text-xs text-foreground/40 ${className}`}>No image</div>;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={alt} loading={eager ? "eager" : "lazy"} decoding="async" className={`object-cover ${className}`} />;
}

export function PageShell({ children, width = "max-w-6xl" }: { children: ReactNode; width?: string }) {
  return <main className={`mx-auto w-full ${width} flex-1 px-6 pb-24 pt-10 sm:px-8`}>{children}</main>;
}

export function SummaryRow({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className={`flex justify-between gap-4 ${accent ? "text-accent-700" : ""}`}>
      <span>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}

export function LockIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <rect x="4" y="11" width="16" height="10" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  );
}
