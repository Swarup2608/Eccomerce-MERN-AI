"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import { FormError } from "@/components/form-field";
import { Button, Card, Loading, PageHeader, StatusPill, Table } from "@/components/ui";
import { adminApi, ORDER_STATUS_LABELS } from "@/lib/admin-api";
import { errorMessage } from "@/lib/auth";
import { formatDate, formatInr } from "@/lib/money";
import { useLoad } from "@/lib/use-load";

export function CustomerDetailView({ customerId }: { customerId: string }) {
  const load = useCallback(() => adminApi.customer(customerId), [customerId]);
  const { data: customer, error: loadError, setData } = useLoad(load);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  if (!customer) return loadError ? <FormError message={loadError} /> : <Loading />;
  const suspended = customer.status === "suspended";

  async function toggle() {
    if (!customer) return;
    if (!suspended && !window.confirm(`Suspend ${customer.firstName}? They are signed out everywhere and cannot sign in until reactivated.`)) return;
    setPending(true);
    try {
      setData(await adminApi.setCustomerStatus(customer.id, suspended ? "active" : "suspended"));
      setError(null);
    } catch (err) {
      setError(errorMessage(err));
    }
    setPending(false);
  }

  return (
    <>
      <PageHeader
        title={`${customer.firstName} ${customer.lastName}`}
        description={`${customer.email} · joined ${formatDate(customer.createdAt)}`}
        actions={
          <>
            <StatusPill status={customer.status} />
            <Button variant={suspended ? "secondary" : "danger"} disabled={pending} onClick={toggle}>
              {suspended ? "Reactivate" : "Suspend"}
            </Button>
          </>
        }
      />
      <FormError message={error} />
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Card>
          <p className="text-xs uppercase tracking-wide text-black/50 dark:text-white/50">Orders</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{customer.orderCount}</p>
        </Card>
        <Card>
          <p className="text-xs uppercase tracking-wide text-black/50 dark:text-white/50">Total spent</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{formatInr(customer.totalSpent)}</p>
        </Card>
        <Card>
          <p className="text-xs uppercase tracking-wide text-black/50 dark:text-white/50">Contact</p>
          <p className="mt-1 text-sm">{customer.phoneNumber ?? "No phone"}</p>
          <p className="text-sm text-black/60 dark:text-white/60">@{customer.userName}</p>
        </Card>
      </div>
      <Card title="Recent orders">
        <Table
          empty={customer.orders.length === 0}
          head={
            <tr>
              <th className="px-3 py-2">Order</th>
              <th className="px-3 py-2">Placed</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2 text-right">Total</th>
            </tr>
          }
        >
          {customer.orders.map((order) => (
            <tr key={order.id}>
              <td className="px-3 py-2 font-mono text-xs">
                <Link href={`/orders/${order.id}`} className="hover:underline">
                  {order.orderNumber}
                </Link>
              </td>
              <td className="px-3 py-2 text-black/60 dark:text-white/60">{formatDate(order.createdAt)}</td>
              <td className="px-3 py-2">
                <StatusPill status={order.status} label={ORDER_STATUS_LABELS[order.status]} />
              </td>
              <td className="px-3 py-2 text-right tabular-nums">{formatInr(order.pricing.total)}</td>
            </tr>
          ))}
        </Table>
      </Card>
    </>
  );
}
