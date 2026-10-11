"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { FiSearch } from "react-icons/fi";
import AdminShell, { PageSpinner } from "@/components/AdminShell";
import { Badge, EmptyState, ErrorState, formatDate, PageHeader, Pagination } from "@/components/ui";
import { listVendors, type VendorStatus } from "@/lib/api/admin";
import { useApi } from "@/lib/useApi";

const STATUSES: VendorStatus[] = ["active", "pending", "suspended", "rejected"];

export default function VendorsPage() {
  return (
    <AdminShell>
      {/* useSearchParams needs a Suspense boundary for static rendering. */}
      <Suspense fallback={<PageSpinner label="Loading vendors…" />}>
        <Vendors />
      </Suspense>
    </AdminShell>
  );
}

function Vendors() {
  const searchParams = useSearchParams();
  const initialStatus = searchParams.get("status");
  const [status, setStatus] = useState<VendorStatus | "">(STATUSES.includes(initialStatus as VendorStatus) ? (initialStatus as VendorStatus) : "");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const { data, error, loading, reload } = useApi(`vendors:${status}:${search}:${page}`, async () => (await listVendors({ status: status || undefined, search, page })).data);

  return (
    <>
      <PageHeader eyebrow="Sellers" title="Vendors" description="Every seller account, including those still applying." />

      <div className="mb-4 flex flex-wrap gap-3">
        <form
          className="relative min-w-60 flex-1"
          onSubmit={(event) => {
            event.preventDefault();
            setSearch(searchInput.trim());
            setPage(1);
          }}
        >
          <FiSearch className="absolute top-1/2 left-3 -translate-y-1/2 text-muted" size={16} />
          <input className="field pl-9" placeholder="Search business name" value={searchInput} onChange={(event) => setSearchInput(event.target.value)} aria-label="Search vendors" />
        </form>
        <select
          className="field w-auto"
          aria-label="Filter by status"
          value={status}
          onChange={(event) => {
            setStatus(event.target.value as VendorStatus | "");
            setPage(1);
          }}
        >
          <option value="">All statuses</option>
          {STATUSES.map((value) => (
            <option key={value} value={value} className="capitalize">
              {value}
            </option>
          ))}
        </select>
      </div>

      {loading && !data ? (
        <PageSpinner label="Loading vendors…" />
      ) : error && !data ? (
        <ErrorState message={error} onRetry={reload} />
      ) : !data || data.vendors.length === 0 ? (
        <EmptyState title="No vendors match" />
      ) : (
        <>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Business</th>
                  <th>Store</th>
                  <th>Status</th>
                  <th>Commission</th>
                  <th>Joined</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {data.vendors.map((vendor) => (
                  <tr key={vendor._id}>
                    <td>
                      <span className="block font-semibold">{vendor.businessName}</span>
                      <span className="text-xs capitalize text-muted">{vendor.businessType.replaceAll("_", " ")}</span>
                    </td>
                    <td>{vendor.store ? <span>{vendor.store.name}</span> : <span className="text-muted">—</span>}</td>
                    <td>
                      <Badge value={vendor.status} />
                    </td>
                    <td className="tabular-nums">{vendor.commissionPercent !== undefined ? `${vendor.commissionPercent}% (custom)` : "Default"}</td>
                    <td className="whitespace-nowrap text-muted">{formatDate(vendor.createdAt)}</td>
                    <td className="text-right">
                      <Link href={`/vendors/${vendor._id}`} className="btn-secondary">
                        Open
                      </Link>
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
