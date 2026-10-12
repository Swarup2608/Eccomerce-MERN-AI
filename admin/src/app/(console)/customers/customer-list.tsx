"use client";

import Link from "next/link";
import { useCallback, useState, type FormEvent } from "react";
import { FormError } from "@/components/form-field";
import { Button, Input, Loading, PageHeader, Pagination, Select, StatusPill, Table } from "@/components/ui";
import { adminApi } from "@/lib/admin-api";
import { formatDate } from "@/lib/money";
import { useLoad } from "@/lib/use-load";

export function CustomerList() {
  const [filters, setFilters] = useState({ q: "", status: "", page: 1 });
  const [search, setSearch] = useState("");
  const load = useCallback(() => adminApi.customers({ ...filters, limit: 25 }), [filters]);
  const { data, error, loading } = useLoad(load);

  function onSearch(event: FormEvent) {
    event.preventDefault();
    setFilters({ ...filters, q: search.trim(), page: 1 });
  }

  return (
    <>
      <PageHeader title="Customers" description="Storefront accounts. Suspending one signs it out everywhere." />
      <div className="mb-4 flex flex-wrap gap-2">
        <form onSubmit={onSearch} className="flex gap-2">
          <Input type="search" placeholder="Name, email or username" value={search} onChange={(event) => setSearch(event.target.value)} className="w-64" />
          <Button type="submit">Search</Button>
        </form>
        <Select value={filters.status} onChange={(event) => setFilters({ ...filters, status: event.target.value, page: 1 })} aria-label="Status">
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="suspended">Suspended</option>
          <option value="inactive">Inactive</option>
        </Select>
      </div>
      <FormError message={error} />
      {!data ? (
        loading ? <Loading /> : null
      ) : (
        <>
          <Table
            empty={data.items.length === 0}
            head={
              <tr>
                <th className="px-3 py-2">Name</th>
                <th className="px-3 py-2">Email</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Joined</th>
                <th className="px-3 py-2">Last sign-in</th>
              </tr>
            }
          >
            {data.items.map((customer) => (
              <tr key={customer.id}>
                <td className="px-3 py-2">
                  <Link href={`/customers/${customer.id}`} className="font-medium hover:underline">
                    {customer.firstName} {customer.lastName}
                  </Link>
                  <p className="text-xs text-black/50 dark:text-white/50">@{customer.userName}</p>
                </td>
                <td className="px-3 py-2">
                  {customer.email}
                  {!customer.emailVerified ? <p className="text-xs text-amber-600">Not verified</p> : null}
                </td>
                <td className="px-3 py-2">
                  <StatusPill status={customer.status} />
                </td>
                <td className="px-3 py-2 text-black/60 dark:text-white/60">{formatDate(customer.createdAt)}</td>
                <td className="px-3 py-2 text-black/60 dark:text-white/60">{customer.lastLoginAt ? formatDate(customer.lastLoginAt) : "Never"}</td>
              </tr>
            ))}
          </Table>
          <Pagination page={data.page} totalPages={data.totalPages} total={data.total} onPage={(page) => setFilters({ ...filters, page })} />
        </>
      )}
    </>
  );
}
