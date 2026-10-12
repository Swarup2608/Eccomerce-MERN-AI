import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from "react";

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

export const buttonClass = (variant: Variant = "secondary"): string => `inline-flex items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${VARIANTS[variant]}`;

export function Button({ variant = "secondary", className = "", type = "button", ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return <button type={type} className={`${buttonClass(variant)} ${className}`} {...props} />;
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
  return <p className="py-16 text-center text-sm text-black/50 dark:text-white/50">{label}</p>;
}

// Product photos come from the R2 public bucket. A plain <img> (lazy, fixed aspect ratio) keeps the CSP simple.
export function ProductPhoto({ src, alt, className = "", eager = false }: { src: string | null | undefined; alt: string; className?: string; eager?: boolean }) {
  if (!src) return <div className={`flex items-center justify-center bg-black/[0.04] text-xs text-black/40 dark:bg-white/[0.06] dark:text-white/40 ${className}`}>No image</div>;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={alt} loading={eager ? "eager" : "lazy"} decoding="async" className={`object-cover ${className}`} />;
}

export function PageShell({ children, width = "max-w-6xl" }: { children: ReactNode; width?: string }) {
  return <main className={`mx-auto w-full ${width} flex-1 px-6 py-10`}>{children}</main>;
}
