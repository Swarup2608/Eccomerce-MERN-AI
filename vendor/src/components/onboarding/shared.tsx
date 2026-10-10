"use client";

import type { ReactNode } from "react";
import type { Onboarding } from "@/lib/api/onboarding";

export interface StepProps {
  data: Onboarding;
  editable: boolean;
  // Reloads onboarding state after a successful save.
  onSaved: () => Promise<void>;
}

export function StepCard({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <section className="rounded-3xl border border-border bg-surface p-6 shadow-sm sm:p-8">
      <h2 className="text-xl font-black">{title}</h2>
      <p className="mt-1 text-sm text-muted">{description}</p>
      <div className="mt-6">{children}</div>
    </section>
  );
}

export function Field({ label, error, hint, children }: { label: string; error?: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block text-sm font-semibold">
      {label}
      <div className="mt-1.5">{children}</div>
      {hint && !error && <span className="mt-1 block text-xs font-normal text-muted">{hint}</span>}
      {error && <span className="mt-1 block text-xs font-medium text-danger">{error}</span>}
    </label>
  );
}

const STATUS_STYLES: Record<string, string> = {
  pending: "bg-amber-50 text-warning",
  verified: "bg-green-50 text-success",
  rejected: "bg-red-50 text-danger",
};

export function StatusPill({ status }: { status: string }) {
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold capitalize ${STATUS_STYLES[status] ?? "bg-slate-100 text-slate-600"}`}>{status}</span>;
}

export function ReadOnlyNotice() {
  return <p className="mb-5 rounded-xl bg-slate-50 px-3 py-2 text-sm text-muted">Your application is with our team, so these details are read-only for now.</p>;
}
