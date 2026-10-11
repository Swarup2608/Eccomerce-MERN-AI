"use client";

import { useState, type ReactNode } from "react";
import type { Pagination as PaginationData } from "@/lib/api/admin";

export function PageHeader({ eyebrow, title, description, actions }: { eyebrow?: string; title: string; description?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        {eyebrow && <p className="text-xs font-bold tracking-[0.18em] text-primary uppercase">{eyebrow}</p>}
        <h1 className="mt-1 text-2xl font-black sm:text-3xl">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

const TONES: Record<string, string> = {
  active: "bg-green-50 text-success",
  approved: "bg-green-50 text-success",
  verified: "bg-green-50 text-success",
  published: "bg-green-50 text-success",
  pending: "bg-amber-50 text-warning",
  submitted: "bg-amber-50 text-warning",
  in_progress: "bg-slate-100 text-slate-600",
  draft: "bg-slate-100 text-slate-600",
  inactive: "bg-slate-100 text-slate-600",
  archived: "bg-slate-100 text-slate-600",
  suspended: "bg-red-50 text-danger",
  rejected: "bg-red-50 text-danger",
  deleted: "bg-red-50 text-danger",
};

export function Badge({ value }: { value: string }) {
  return <span className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-bold capitalize ${TONES[value] ?? "bg-slate-100 text-slate-600"}`}>{value.replaceAll("_", " ")}</span>;
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-3xl border border-border bg-surface p-6 shadow-sm ${className}`}>{children}</section>;
}

export function EmptyState({ title, description }: { title: string; description?: string }) {
  return (
    <div className="rounded-3xl border border-dashed border-border bg-surface px-6 py-14 text-center">
      <p className="font-bold">{title}</p>
      {description && <p className="mt-1 text-sm text-muted">{description}</p>}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div role="alert" className="rounded-3xl border border-red-100 bg-surface px-6 py-10 text-center">
      <p className="font-bold">{message}</p>
      <button type="button" className="btn-primary mt-4" onClick={onRetry}>
        Try again
      </button>
    </div>
  );
}

export function Pagination({ pagination, onPage }: { pagination: PaginationData; onPage: (page: number) => void }) {
  if (pagination.totalPages <= 1) return null;

  return (
    <div className="mt-4 flex items-center justify-between text-sm">
      <span className="text-muted">
        Page {pagination.page} of {pagination.totalPages} · {pagination.total} total
      </span>
      <div className="flex gap-2">
        <button type="button" className="btn-secondary" disabled={!pagination.hasPreviousPage} onClick={() => onPage(pagination.page - 1)}>
          Previous
        </button>
        <button type="button" className="btn-secondary" disabled={!pagination.hasNextPage} onClick={() => onPage(pagination.page + 1)}>
          Next
        </button>
      </div>
    </div>
  );
}

// Modal that collects a written reason (rejections, suspensions) before confirming.
export function ReasonDialog({ title, description, confirmLabel, minLength = 5, onConfirm, onClose }: { title: string; description: string; confirmLabel: string; minLength?: number; onConfirm: (reason: string) => Promise<void>; onClose: () => void }) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" role="dialog" aria-modal="true" aria-labelledby="reason-dialog-title">
      <div className="w-full max-w-md rounded-3xl bg-surface p-6 shadow-xl">
        <h2 id="reason-dialog-title" className="text-lg font-black">
          {title}
        </h2>
        <p className="mt-1 text-sm text-muted">{description}</p>
        <textarea className="field mt-4 min-h-28" value={reason} onChange={(event) => setReason(event.target.value)} maxLength={1000} autoFocus />
        <p className="mt-1 text-xs text-muted">At least {minLength} characters. The seller will see this.</p>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button
            type="button"
            className="btn-danger"
            disabled={busy || reason.trim().length < minLength}
            onClick={async () => {
              setBusy(true);
              try {
                await onConfirm(reason.trim());
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? "Working…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export function formatDate(value?: string | null): string {
  return value ? new Date(value).toLocaleDateString("en-IN", { dateStyle: "medium" }) : "—";
}

export function formatDateTime(value?: string | null): string {
  return value ? new Date(value).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : "—";
}
