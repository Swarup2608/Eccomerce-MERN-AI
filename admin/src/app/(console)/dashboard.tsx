"use client";

import Link from "next/link";
import { FormError } from "@/components/form-field";
import { ButtonLink, Card, Loading, PageHeader, StatusPill, Table } from "@/components/ui";
import { adminApi, ORDER_STATUS_LABELS, type Stats } from "@/lib/admin-api";
import { formatDate, formatInr } from "@/lib/money";
import { useLoad } from "@/lib/use-load";

export function Dashboard() {
  const { data: stats, error } = useLoad(adminApi.stats);

  return (
    <>
      <PageHeader title="Dashboard" description="Today at a glance and the last 30 days." actions={<ButtonLink href="/products/new" variant="primary">New product</ButtonLink>} />
      <FormError message={error} />
      {!stats ? (
        error ? null : <Loading />
      ) : (
        <div className="flex flex-col gap-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Tile label="Orders today" value={String(stats.today.orders)} detail={formatInr(stats.today.revenue)} />
            <Tile label="Revenue, 30 days" value={formatInr(stats.last30Days.revenue)} detail={`${stats.last30Days.orders} orders`} />
            <Tile label="To fulfil" value={String(stats.toFulfil)} detail="Confirmed or processing" href="/orders?status=confirmed" />
            <Tile label="Awaiting payment" value={String(stats.awaitingPayment)} detail="Released automatically if unpaid" href="/orders?status=pending_payment" />
            <Tile label="Low-stock products" value={String(stats.lowStockProducts)} detail="A variant has 5 or fewer left" href="/products?lowStock=true" />
          </div>

          <Card title="Revenue, last 30 days">
            <RevenueChart daily={stats.last30Days.daily} />
          </Card>

          <Card title="Recent orders" actions={<Link href="/orders" className="text-sm hover:underline">View all</Link>}>
            <Table
              empty={stats.recent.length === 0}
              head={
                <tr>
                  <th className="px-3 py-2">Order</th>
                  <th className="px-3 py-2">Customer</th>
                  <th className="px-3 py-2">Placed</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2 text-right">Total</th>
                </tr>
              }
            >
              {stats.recent.map((order) => (
                <tr key={order.id}>
                  <td className="px-3 py-2 font-mono text-xs">
                    <Link href={`/orders/${order.id}`} className="hover:underline">
                      {order.orderNumber}
                    </Link>
                  </td>
                  <td className="px-3 py-2">{order.customer.name}</td>
                  <td className="px-3 py-2 text-black/60 dark:text-white/60">{formatDate(order.createdAt)}</td>
                  <td className="px-3 py-2">
                    <StatusPill status={order.status} label={ORDER_STATUS_LABELS[order.status]} />
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatInr(order.pricing.total)}</td>
                </tr>
              ))}
            </Table>
          </Card>
        </div>
      )}
    </>
  );
}

function Tile({ label, value, detail, href }: { label: string; value: string; detail: string; href?: string }) {
  const body = (
    <div className="rounded-lg border border-black/10 p-4 transition hover:border-black/20 dark:border-white/10 dark:hover:border-white/20">
      <p className="text-xs font-medium uppercase tracking-wide text-black/50 dark:text-white/50">{label}</p>
      <p className="mt-2 text-2xl font-semibold tabular-nums">{value}</p>
      <p className="mt-1 text-xs text-black/50 dark:text-white/50">{detail}</p>
    </div>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}

// Plain bars: one per day, height relative to the best day. The title on each bar carries the exact numbers.
function RevenueChart({ daily }: { daily: Stats["last30Days"]["daily"] }) {
  const max = Math.max(1, ...daily.map((day) => day.revenue));
  if (daily.every((day) => day.revenue === 0)) return <p className="py-6 text-center text-sm text-black/50 dark:text-white/50">No sales in the last 30 days yet.</p>;
  return (
    <div>
      <div className="flex h-40 items-end gap-1" role="img" aria-label="Daily revenue for the last 30 days">
        {daily.map((day) => (
          <div key={day.date} className="group relative flex h-full flex-1 items-end" title={`${day.date}: ${formatInr(day.revenue)} from ${day.orders} order${day.orders === 1 ? "" : "s"}`}>
            <div className="w-full rounded-t bg-foreground/70 group-hover:bg-foreground" style={{ height: `${Math.max(day.revenue > 0 ? 2 : 0, (day.revenue / max) * 100)}%` }} />
          </div>
        ))}
      </div>
      <div className="mt-2 flex justify-between text-xs text-black/50 dark:text-white/50">
        <span>{daily[0]?.date}</span>
        <span>{daily.at(-1)?.date}</span>
      </div>
    </div>
  );
}
