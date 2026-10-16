"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { FormError } from "@/components/form-field";
import { OrderStatusTag, OrderTimeline, Thumb } from "@/components/order-bits";
import { EmptyState, Loading } from "@/components/ui";
import { errorMessage } from "@/lib/auth";
import { formatDate, formatInr } from "@/lib/money";
import { shopApi, type Order } from "@/lib/shop-api";

export function OrderList() {
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{ items: Order[]; totalPages: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    let current = true;
    shopApi.orders(page).then(
      (result) => {
        if (!current) return;
        setData(result);
        setOpen(result.items[0]?.id ?? null);
      },
      (err: unknown) => current && setError(errorMessage(err)),
    );
    return () => {
      current = false;
    };
  }, [page]);

  if (!data) return error ? <FormError message={error} /> : <Loading />;
  if (data.items.length === 0) {
    return (
      <EmptyState title="No orders yet." text="When you place an order, you can track it here.">
        <Link href={"/products"} className="btn btn-primary">
          Start shopping
        </Link>
      </EmptyState>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <ul className="border-t border-divider">
        {data.items.map((order) => {
          const expanded = open === order.id;
          const count = order.items.reduce((sum, item) => sum + item.quantity, 0);
          return (
            <li key={order.id} className="border-b border-divider">
              <button type="button" aria-expanded={expanded} onClick={() => setOpen(expanded ? null : order.id)} className="grid w-full grid-cols-2 items-center gap-4 py-5 text-left sm:grid-cols-[minmax(0,1.4fr)_repeat(3,minmax(0,1fr))_32px]">
                <span className="flex flex-col">
                  <span className="font-heading text-[22px]">{order.orderNumber}</span>
                  <span className="text-[13px] opacity-60">{formatDate(order.createdAt)}</span>
                </span>
                <span className="text-sm">
                  {count} item{count === 1 ? "" : "s"}
                </span>
                <span className="text-sm tabular-nums">{formatInr(order.pricing.total)}</span>
                <span>
                  <OrderStatusTag status={order.status} />
                </span>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden className={`hidden justify-self-end transition-transform duration-300 sm:block ${expanded ? "rotate-180" : ""}`}>
                  <path d="m6 9 6 6 6-6" />
                </svg>
              </button>
              {expanded ? (
                <div className="grid gap-10 pb-8 pt-2 md:grid-cols-2">
                  <OrderTimeline order={order} />
                  <div className="flex flex-col gap-3">
                    {order.items.map((item) => (
                      <div key={item.sku} className="flex items-center gap-3.5">
                        <Link href={`/products/${item.slug}`} aria-label={item.title}>
                          <Thumb src={item.image} />
                        </Link>
                        <span className="flex min-w-0 flex-1 flex-col">
                          <span className="truncate font-medium">{item.title}</span>
                          <span className="text-xs opacity-60">
                            {Object.values(item.options).join(" · ")}
                            {Object.keys(item.options).length ? " " : ""}× {item.quantity} · {formatInr(item.lineTotal)}
                          </span>
                        </span>
                        <Link href={`/products/${item.slug}`} className="btn btn-secondary min-h-9 px-4 text-sm">
                          Buy again
                        </Link>
                      </div>
                    ))}
                    <div className="mt-2 flex flex-wrap gap-2.5">
                      <Link href={`/account/orders/${order.id}`} className="btn btn-primary min-h-10">
                        {order.status === "pending_payment" ? "Pay now →" : "Order details →"}
                      </Link>
                    </div>
                  </div>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
      {data.totalPages > 1 ? (
        <div className="flex items-center justify-center gap-3">
          <button type="button" className="btn btn-secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>
            ← Previous
          </button>
          <span className="text-sm tabular-nums opacity-65">
            {page} / {data.totalPages}
          </span>
          <button type="button" className="btn btn-secondary" disabled={page >= data.totalPages} onClick={() => setPage(page + 1)}>
            Next →
          </button>
        </div>
      ) : null}
    </div>
  );
}
