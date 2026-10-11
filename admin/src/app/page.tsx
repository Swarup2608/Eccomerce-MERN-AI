"use client";

import Link from "next/link";
import { FiArrowRight, FiBox, FiClipboard, FiShoppingBag, FiUsers } from "react-icons/fi";
import AdminShell, { PageSpinner } from "@/components/AdminShell";
import { Card, ErrorState, formatDate, PageHeader } from "@/components/ui";
import { getDashboard } from "@/lib/api/admin";
import { useApi } from "@/lib/useApi";

export default function OverviewPage() {
  return (
    <AdminShell>
      <Overview />
    </AdminShell>
  );
}

function Overview() {
  const { data, error, loading, reload } = useApi("dashboard", async () => (await getDashboard()).data);

  if (loading && !data) return <PageSpinner label="Loading marketplace overview…" />;
  if (error && !data) return <ErrorState message={error} onRetry={reload} />;
  if (!data) return null;

  const tiles = [
    { label: "Pending applications", value: data.vendors.pendingApplications, href: "/applications", icon: FiClipboard, highlight: data.vendors.pendingApplications > 0 },
    { label: "Active vendors", value: data.vendors.byStatus.active ?? 0, href: "/vendors?status=active", icon: FiShoppingBag },
    { label: "Active users", value: data.users.active, sub: `${data.users.newLast30Days} new in 30 days`, href: "/users", icon: FiUsers },
    { label: "Live products", value: data.catalog.productsByStatus.active ?? 0, sub: `${data.catalog.productsByStatus.draft ?? 0} drafts`, href: "/products", icon: FiBox },
  ];

  return (
    <>
      <PageHeader eyebrow="Overview" title="Marketplace at a glance" />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {tiles.map(({ label, value, sub, href, icon: Icon, highlight }) => (
          <Link key={label} href={href} className={`group rounded-3xl border bg-surface p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${highlight ? "border-amber-200" : "border-border"}`}>
            <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${highlight ? "bg-amber-50 text-warning" : "bg-teal-50 text-primary"}`}>
              <Icon size={19} />
            </span>
            <p className="mt-4 text-3xl font-black tabular-nums">{value.toLocaleString("en-IN")}</p>
            <p className="mt-1 text-sm font-semibold text-slate-600">{label}</p>
            {sub && <p className="mt-0.5 text-xs text-muted">{sub}</p>}
          </Link>
        ))}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Card>
          <div className="flex items-center justify-between">
            <h2 className="font-black">Waiting for review</h2>
            <Link href="/applications" className="flex items-center gap-1 text-sm font-semibold text-primary">
              All applications <FiArrowRight size={14} />
            </Link>
          </div>
          {data.recentApplications.length === 0 ? (
            <p className="mt-4 text-sm text-muted">No applications are waiting. Nice work.</p>
          ) : (
            <ul className="mt-4 divide-y divide-border">
              {data.recentApplications.map((application) => (
                <li key={application._id} className="flex items-center justify-between gap-3 py-3 text-sm">
                  <span>
                    <span className="block font-semibold">{application.vendorId?.businessName ?? "Unknown vendor"}</span>
                    <span className="text-xs text-muted">Submitted {formatDate(application.submittedAt)}</span>
                  </span>
                  {application.vendorId && (
                    <Link href={`/vendors/${application.vendorId._id}`} className="btn-secondary">
                      Review
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <h2 className="font-black">People</h2>
          <dl className="mt-4 space-y-2 text-sm">
            {Object.entries(data.users.byRole)
              .sort(([, a], [, b]) => b - a)
              .map(([role, count]) => (
                <div key={role} className="flex justify-between">
                  <dt className="capitalize text-muted">{role.replaceAll("_", " ")}</dt>
                  <dd className="font-bold tabular-nums">{count.toLocaleString("en-IN")}</dd>
                </div>
              ))}
          </dl>
          <h2 className="mt-6 font-black">Vendors</h2>
          <dl className="mt-4 space-y-2 text-sm">
            {(["active", "pending", "suspended", "rejected"] as const).map((status) => (
              <div key={status} className="flex justify-between">
                <dt className="capitalize text-muted">{status}</dt>
                <dd className="font-bold tabular-nums">{(data.vendors.byStatus[status] ?? 0).toLocaleString("en-IN")}</dd>
              </div>
            ))}
          </dl>
        </Card>
      </div>
    </>
  );
}
