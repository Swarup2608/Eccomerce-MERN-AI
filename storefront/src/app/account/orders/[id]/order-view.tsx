"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { FormError } from "@/components/form-field";
import { Button, Loading, Notice, ProductPhoto } from "@/components/ui";
import { errorMessage } from "@/lib/auth";
import { formatDateTime, formatInr } from "@/lib/money";
import { startPayment } from "@/lib/payments";
import { ORDER_STATUS_LABELS, PAYMENT_METHOD_LABELS, shopApi, type Order, type OrderStatus } from "@/lib/shop-api";

const STEPS: OrderStatus[] = ["confirmed", "processing", "shipped", "delivered"];
// After returning from Stripe the webhook may land a few seconds later: poll briefly for the confirmation.
const POLL_MS = 3_000;
const POLL_LIMIT = 20;

export function OrderView({ orderId }: { orderId: string }) {
  const [order, setOrder] = useState<Order | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<string | null>(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("placed")) return "Thank you! Your order has been placed.";
    if (params.get("payment") === "cancelled") return "Payment was cancelled. You can pay again below while the order is held.";
    return null;
  });
  const [confirming, setConfirming] = useState(() => new URLSearchParams(window.location.search).get("payment") === "success");

  useEffect(() => {
    let current = true;
    let polls = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const load = () =>
      shopApi.order(orderId).then(
        (loaded) => {
          if (!current) return;
          setOrder(loaded);
          if (confirming && loaded.status === "pending_payment" && (polls += 1) < POLL_LIMIT) timer = setTimeout(load, POLL_MS);
          else if (confirming) {
            setConfirming(false);
            if (loaded.status !== "pending_payment") setNotice("Payment received. Thank you for your order!");
          }
        },
        (err: unknown) => current && setError(errorMessage(err)),
      );
    void load();
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [orderId, confirming]);

  if (!order) return error ? <FormError message={error} /> : <Loading />;

  async function pay() {
    if (!order) return;
    setPending(true);
    setError(null);
    try {
      const { payment } = await shopApi.payOrder(order.id);
      if (!payment) return;
      const outcome = await startPayment(order, payment);
      if (outcome === "redirecting") return;
      setOrder(await shopApi.order(order.id));
      if (outcome === "paid") setNotice("Payment received. Thank you for your order!");
    } catch (err) {
      setError(errorMessage(err));
    }
    setPending(false);
  }

  async function cancel() {
    if (!order || !window.confirm("Cancel this order?" + (order.payment.status === "paid" ? " Your payment will be refunded." : ""))) return;
    setPending(true);
    setError(null);
    try {
      setOrder(await shopApi.cancelOrder(order.id, ""));
      setNotice("Your order has been cancelled.");
    } catch (err) {
      setError(errorMessage(err));
    }
    setPending(false);
  }

  const stepIndex = STEPS.indexOf(order.status);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="mb-1 text-xs text-black/50 dark:text-white/50">
          <Link href="/account/orders" className="hover:underline">
            Your orders
          </Link>
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">Order {order.orderNumber}</h1>
        <p className="mt-1 text-sm text-black/60 dark:text-white/60">Placed {formatDateTime(order.createdAt)}</p>
      </div>

      {notice ? <Notice>{notice}</Notice> : null}
      {confirming ? <Notice tone="amber">Confirming your payment...</Notice> : null}
      <FormError message={error} />

      {order.status === "pending_payment" ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-sm">
          <span>
            Waiting for payment.{order.expiresAt ? ` Your items are held until ${formatDateTime(order.expiresAt)}.` : ""}
          </span>
          {order.canPay ? (
            <Button variant="primary" disabled={pending} onClick={pay}>
              Pay {formatInr(order.pricing.total)}
            </Button>
          ) : null}
        </div>
      ) : null}

      {stepIndex >= 0 ? (
        <ol className="grid grid-cols-4 gap-2 text-xs">
          {STEPS.map((step, index) => (
            <li key={step} className="flex flex-col gap-1.5">
              <span className={`h-1.5 rounded-full ${index <= stepIndex ? "bg-foreground" : "bg-black/10 dark:bg-white/15"}`} />
              <span className={index <= stepIndex ? "font-medium" : "text-black/50 dark:text-white/50"}>{ORDER_STATUS_LABELS[step]}</span>
            </li>
          ))}
        </ol>
      ) : (
        <p className={`text-sm font-medium ${order.status === "cancelled" ? "text-red-600" : ""}`}>
          {ORDER_STATUS_LABELS[order.status]}
          {order.cancelReason ? <span className="font-normal text-black/60 dark:text-white/60"> · {order.cancelReason}</span> : null}
        </p>
      )}

      {order.tracking ? (
        <p className="text-sm">
          Shipped with {order.tracking.carrier}, tracking number <span className="font-mono">{order.tracking.number}</span>
          {order.tracking.url ? (
            <>
              {" · "}
              <a href={order.tracking.url} target="_blank" rel="noreferrer noopener" className="underline">
                Track parcel
              </a>
            </>
          ) : null}
        </p>
      ) : null}

      <ul className="divide-y divide-black/10 rounded-lg border border-black/10 dark:divide-white/10 dark:border-white/10">
        {order.items.map((item) => (
          <li key={item.sku} className="flex items-center gap-4 p-4 text-sm">
            <ProductPhoto src={item.image} alt={item.title} className="h-20 w-16 shrink-0 rounded-md" />
            <div className="min-w-0 flex-1">
              <Link href={`/products/${item.slug}`} className="font-medium hover:underline">
                {item.title}
              </Link>
              <p className="text-black/60 dark:text-white/60">
                {Object.values(item.options).join(" / ")}
                {Object.keys(item.options).length ? " · " : ""}Qty {item.quantity}
              </p>
            </div>
            <span className="tabular-nums">{formatInr(item.lineTotal)}</span>
          </li>
        ))}
      </ul>

      <div className="grid gap-6 sm:grid-cols-2">
        <section className="text-sm">
          <h2 className="mb-2 font-semibold">Delivery address</h2>
          <address className="not-italic leading-relaxed text-black/70 dark:text-white/70">
            {order.shippingAddress.fullName}
            <br />
            {order.shippingAddress.line1}
            {order.shippingAddress.line2 ? `, ${order.shippingAddress.line2}` : ""}
            <br />
            {order.shippingAddress.city}, {order.shippingAddress.state} {order.shippingAddress.postalCode}
            <br />
            {order.shippingAddress.phone}
          </address>
        </section>
        <section className="text-sm">
          <h2 className="mb-2 font-semibold">Payment</h2>
          <dl className="flex flex-col gap-1">
            <div className="flex justify-between"><dt>Subtotal</dt><dd className="tabular-nums">{formatInr(order.pricing.subtotal)}</dd></div>
            <div className="flex justify-between"><dt>Shipping</dt><dd className="tabular-nums">{order.pricing.shipping ? formatInr(order.pricing.shipping) : "Free"}</dd></div>
            <div className="flex justify-between font-semibold"><dt>Total</dt><dd className="tabular-nums">{formatInr(order.pricing.total)}</dd></div>
            <div className="flex justify-between text-black/60 dark:text-white/60"><dt>Method</dt><dd>{PAYMENT_METHOD_LABELS[order.payment.method]}</dd></div>
            {order.payment.amountRefunded > 0 ? <div className="flex justify-between text-emerald-700 dark:text-emerald-400"><dt>Refunded</dt><dd className="tabular-nums">{formatInr(order.payment.amountRefunded)}</dd></div> : null}
          </dl>
        </section>
      </div>

      {order.canCancel ? (
        <div>
          <Button variant="danger" disabled={pending} onClick={cancel}>
            Cancel order
          </Button>
        </div>
      ) : null}
    </div>
  );
}
