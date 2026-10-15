import type { BackendStatus } from "@/lib/api";

const STYLES: Record<BackendStatus, { dot: string; label: string }> = {
  online: { dot: "bg-emerald-500", label: "All systems operational" },
  degraded: { dot: "bg-amber-500", label: "Some services are degraded" },
  offline: { dot: "bg-red-500", label: "API unreachable" },
};

export function StatusBadge({ status }: { status: BackendStatus }) {
  const style = STYLES[status];
  return (
    <span className="inline-flex items-center gap-2 text-xs text-foreground/70" role="status">
      <span aria-hidden className={`size-2 rounded-full ${style.dot}`} />
      {style.label}
    </span>
  );
}
