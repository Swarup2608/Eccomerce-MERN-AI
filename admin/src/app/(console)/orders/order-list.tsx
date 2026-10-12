"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useState, type FormEvent } from "react";
import { FormError } from "@/components/form-field";
import { Button, Input, Loading, PageHeader, Pagination, Select, StatusPill, Table } from "@/components/ui";
import { adminApi, ORDER_STATUS_LABELS, PAYMENT_METHOD_LABELS, PAYMENT_STATUS_LABELS, type OrderStatus, type PaymentMethod, type PaymentStatus } from "@/lib/admin-api";
import { formatDate, formatInr } from "@/lib/money";
import { useLoad } from "@/lib/use-load";

const FILTERS = ["q", "status", "paymentStatus", "paymentMethod", "from", "to"] as const;

export function OrderList() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const filters = Object.fromEntries(FILTERS.map((key) => [key, params.get(key) ?? ""])) as Record<(typeof FILTERS)[number], string>;
  const page = Number(params.get("page") ?? "1") || 1;
  const [search, setSearch] = useState(filters.q);

  const { q, status, paymentStatus, paymentMethod, from, to } = filters;
  const load = useCallback(() => adminApi.orders({ q, status, paymentStatus, paymentMethod, from, to, page, limit: 25 }), [q, status, paymentStatus, paymentMethod, from, to, page]);
  const { data, error, loading } = useLoad(load);

  const navigate = (patch: Record<string, string | undefined>) => {
    const next = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries({ page: undefined, ...patch })) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    router.replace(`${pathname}${next.size ? `?${next.toString()}` : ""}`);
  };

  function onSearch(event: FormEvent) {
    event.preventDefault();
    navigate({ q: search.trim() || undefined });
  }

  return (
    <>
      <PageHeader title="Orders" description="Search by order number, customer email or name." />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <form onSubmit={onSearch} className="flex gap-2">
          <Input type="search" placeholder="ORD-... or email" value={search} onChange={(event) => setSearch(event.target.value)} className="w-56" />
          <Button type="submit">Search</Button>
        </form>
        <Select value={status} onChange={(event) => navigate({ status: event.target.value || undefined })} aria-label="Order status">
          <option value="">All statuses</option>
          {(Object.keys(ORDER_STATUS_LABELS) as OrderStatus[]).map((value) => (
            <option key={value} value={value}>
              {ORDER_STATUS_LABELS[value]}
            </option>
          ))}
        </Select>
        <Select value={paymentStatus} onChange={(event) => navigate({ paymentStatus: event.target.value || undefined })} aria-label="Payment status">
          <option value="">Any payment</option>
          {(Object.keys(PAYMENT_STATUS_LABELS) as PaymentStatus[]).map((value) => (
            <option key={value} value={value}>
              {PAYMENT_STATUS_LABELS[value]}
            </option>
          ))}
        </Select>
        <Select value={paymentMethod} onChange={(event) => navigate({ paymentMethod: event.target.value || undefined })} aria-label="Payment method">
          <option value="">Any method</option>
          {(Object.keys(PAYMENT_METHOD_LABELS) as PaymentMethod[]).map((value) => (
            <option key={value} value={value}>
              {PAYMENT_METHOD_LABELS[value]}
            </option>
          ))}
        </Select>
        <label className="flex items-center gap-1 text-sm">
          From <Input type="date" value={from} onChange={(event) => navigate({ from: event.target.value || undefined })} />
        </label>
        <label className="flex items-center gap-1 text-sm">
          To <Input type="date" value={to} onChange={(event) => navigate({ to: event.target.value || undefined })} />
        </label>
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
                <th className="px-3 py-2">Order</th>
                <th className="px-3 py-2">Customer</th>
                <th className="px-3 py-2">Placed</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Payment</th>
                <th className="px-3 py-2 text-right">Items</th>
                <th className="px-3 py-2 text-right">Total</th>
              </tr>
            }
          >
            {data.items.map((order) => (
              <tr key={order.id} className={loading ? "opacity-60" : ""}>
                <td className="px-3 py-2 font-mono text-xs">
                  <Link href={`/orders/${order.id}`} className="hover:underline">
                    {order.orderNumber}
                  </Link>
                </td>
                <td className="px-3 py-2">
                  {order.customer.name}
                  <p className="text-xs text-black/50 dark:text-white/50">{order.customer.email}</p>
                </td>
                <td className="px-3 py-2 text-black/60 dark:text-white/60">{formatDate(order.createdAt)}</td>
                <td className="px-3 py-2">
                  <StatusPill status={order.status} label={ORDER_STATUS_LABELS[order.status]} />
                </td>
                <td className="px-3 py-2">
                  <StatusPill status={order.payment.status} label={PAYMENT_STATUS_LABELS[order.payment.status]} />
                  <p className="mt-0.5 text-xs text-black/50 dark:text-white/50">{PAYMENT_METHOD_LABELS[order.payment.method]}</p>
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{order.items.reduce((sum, item) => sum + item.quantity, 0)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatInr(order.pricing.total)}</td>
              </tr>
            ))}
          </Table>
          <Pagination page={data.page} totalPages={data.totalPages} total={data.total} onPage={(next) => navigate({ page: String(next) })} />
        </>
      )}
    </>
  );
}
