"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { FormError } from "@/components/form-field";
import { Button, Loading, ProductPhoto, buttonClass } from "@/components/ui";
import { errorMessage } from "@/lib/auth";
import { formatDate, formatInr } from "@/lib/money";
import { ORDER_STATUS_LABELS, shopApi, type Order } from "@/lib/shop-api";

export function OrderList() {
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{ items: Order[]; totalPages: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let current = true;
    shopApi.orders(page).then(
      (result) => current && setData(result),
      (err: unknown) => current && setError(errorMessage(err)),
    );
    return () => {
      current = false;
    };
  }, [page]);

  if (!data) return error ? <FormError message={error} /> : <Loading />;
  if (data.items.length === 0) {
    return (
      <div className="flex flex-col items-center gap-4 py-16 text-center">
        <p className="text-black/60 dark:text-white/60">You have not placed any orders yet.</p>
        <Link href="/products" className={buttonClass("primary")}>
          Start shopping
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {data.items.map((order) => (
        <Link key={order.id} href={`/account/orders/${order.id}`} className="flex flex-col gap-3 rounded-lg border border-black/10 p-4 hover:border-black/30 dark:border-white/10 dark:hover:border-white/30">
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <span className="font-mono">{order.orderNumber}</span>
            <span className="text-black/60 dark:text-white/60">{formatDate(order.createdAt)}</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex -space-x-3">
              {order.items.slice(0, 4).map((item) => (
                <ProductPhoto key={item.sku} src={item.image} alt={item.title} className="size-12 rounded-md border-2 border-background" />
              ))}
            </div>
            <div className="min-w-0 flex-1 text-sm">
              <p className="line-clamp-1">{order.items.map((item) => item.title).join(", ")}</p>
              <p className={`font-medium ${order.status === "cancelled" ? "text-red-600" : order.status === "pending_payment" ? "text-amber-700 dark:text-amber-400" : ""}`}>{ORDER_STATUS_LABELS[order.status]}</p>
            </div>
            <span className="font-semibold tabular-nums">{formatInr(order.pricing.total)}</span>
          </div>
        </Link>
      ))}
      {data.totalPages > 1 ? (
        <div className="flex justify-center gap-3">
          <Button disabled={page <= 1} onClick={() => setPage(page - 1)}>
            Previous
          </Button>
          <Button disabled={page >= data.totalPages} onClick={() => setPage(page + 1)}>
            Next
          </Button>
        </div>
      ) : null}
    </div>
  );
}
