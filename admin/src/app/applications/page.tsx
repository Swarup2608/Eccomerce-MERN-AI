"use client";

import { useState } from "react";
import Link from "next/link";
import AdminShell, { PageSpinner } from "@/components/AdminShell";
import { Badge, EmptyState, ErrorState, formatDate, formatDateTime, PageHeader, Pagination } from "@/components/ui";
import { listApplications, type ApplicationStatus } from "@/lib/api/admin";
import { useApi } from "@/lib/useApi";

const TABS: { value: ApplicationStatus; label: string }[] = [
  { value: "submitted", label: "Awaiting review" },
  { value: "in_progress", label: "In progress" },
  { value: "rejected", label: "Rejected" },
  { value: "approved", label: "Approved" },
];

export default function ApplicationsPage() {
  return (
    <AdminShell>
      <Applications />
    </AdminShell>
  );
}

function Applications() {
  const [status, setStatus] = useState<ApplicationStatus>("submitted");
  const [page, setPage] = useState(1);
  const { data, error, loading, reload } = useApi(`applications:${status}:${page}`, async () => (await listApplications({ status, page })).data);

  return (
    <>
      <PageHeader eyebrow="Sellers" title="Seller applications" description="Oldest submissions first. Open one to check documents and approve or reject it." />

      <div role="tablist" aria-label="Application status" className="mb-4 flex flex-wrap gap-2">
        {TABS.map((tab) => (
          <button
            key={tab.value}
            type="button"
            role="tab"
            aria-selected={status === tab.value}
            onClick={() => {
              setStatus(tab.value);
              setPage(1);
            }}
            className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${status === tab.value ? "bg-slate-900 text-white" : "border border-border bg-surface hover:border-primary hover:text-primary"}`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {loading && !data ? (
        <PageSpinner label="Loading applications…" />
      ) : error && !data ? (
        <ErrorState message={error} onRetry={reload} />
      ) : !data || data.applications.length === 0 ? (
        <EmptyState title="No applications here" description={status === "submitted" ? "New submissions will appear as sellers send them." : undefined} />
      ) : (
        <>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Business</th>
                  <th>Type</th>
                  <th>Status</th>
                  <th>{status === "submitted" ? "Submitted" : "Last updated"}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {data.applications.map((application) => (
                  <tr key={application._id}>
                    <td className="font-semibold">{application.vendorId?.businessName ?? "—"}</td>
                    <td className="capitalize text-muted">{application.vendorId?.businessType.replaceAll("_", " ") ?? "—"}</td>
                    <td>
                      <Badge value={application.status} />
                    </td>
                    <td className="whitespace-nowrap text-muted">{status === "submitted" ? formatDateTime(application.submittedAt) : formatDate(application.updatedAt)}</td>
                    <td className="text-right">
                      {application.vendorId && (
                        <Link href={`/vendors/${application.vendorId._id}`} className="btn-secondary">
                          {status === "submitted" ? "Review" : "Open"}
                        </Link>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination pagination={data.pagination} onPage={setPage} />
        </>
      )}
    </>
  );
}
