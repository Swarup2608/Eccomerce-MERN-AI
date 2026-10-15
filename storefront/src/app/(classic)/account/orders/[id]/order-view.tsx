"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { FormError } from "@/components/form-field";
import { OrderStatusTag, OrderTimeline, Thumb } from "@/components/order-bits";
import { Loading, Notice, SummaryRow } from "@/components/ui";
import { errorMessage } from "@/lib/auth";
import { formatDate, formatDateTime, formatInr } from "@/lib/money";
import { startPayment } from "@/lib/payments";
import { ORDER_STATUS_LABELS, PAYMENT_METHOD_LABELS, shopApi, type Order } from "@/lib/shop-api";
import { confirmDialog } from "@/components/dialog";
import { useHref } from "@/lib/base-path";

const label = "text-xs uppercase tracking-[0.14em] opacity-60";
// After returning from Stripe the webhook may land a few seconds later: poll briefly for the confirmation.
const POLL_MS = 3_000;
const POLL_LIMIT = 20;

export function OrderView({ orderId }: { orderId: string }) {
  const to = useHref();
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
  // Arriving straight from checkout shows the design's "Thank you" hero above the order.
  const [justPlaced] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return Boolean(params.get("placed")) || params.get("payment") === "success";
  });

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
    if (!order) return;
    const ok = await confirmDialog({
      title: `Cancel order ${order.orderNumber}?`,
      message: order.payment.status === "paid" ? "Your payment will be refunded to the original method. This can’t be undone." : "This can’t be undone.",
      confirmLabel: "Cancel order",
      cancelLabel: "Keep order",
      tone: "danger",
    });
    if (!ok) return;
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

  const count = order.items.reduce((sum, item) => sum + item.quantity, 0);
  const address = order.shippingAddress;
  const paid = order.payment.method === "cod" ? "Cash on delivery" : order.status === "pending_payment" ? "Awaiting payment" : PAYMENT_METHOD_LABELS[order.payment.method];

  return (
    <div className="flex flex-col gap-10">
      {justPlaced && order.status !== "cancelled" ? (
        <div className="flex flex-col gap-4 pt-6">
          <span className="grid size-16 place-items-center border-2 border-accent text-accent-700">
            <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <path d="M20 6 9 17l-5-5" />
            </svg>
          </span>
          <span className="text-xs uppercase tracking-[0.14em] text-accent-700">Order {order.orderNumber} {order.status === "pending_payment" ? "placed" : "confirmed"}</span>
          <h1 className="m-0 text-[clamp(48px,6.4vw,96px)] leading-[0.92] tracking-[-0.02em]">{order.status === "pending_payment" ? "Almost there." : "Thank you. It’s on its way."}</h1>
          <p className="m-0 max-w-[560px] text-[17px] text-foreground/70">A receipt is heading to your inbox. We’ll email tracking as soon as the parcel is handed to the courier.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <Link href={to("/account/orders")} className="vk-link self-start text-[13px] opacity-65">
            ← All orders
          </Link>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <h1 className="m-0 text-[clamp(40px,5vw,72px)] leading-none">{order.orderNumber}</h1>
            <OrderStatusTag status={order.status} />
          </div>
          <p className="m-0 text-sm opacity-65">Placed {formatDateTime(order.createdAt)}</p>
        </div>
      )}

      {notice && !justPlaced ? <Notice>{notice}</Notice> : null}
      {confirming ? <Notice tone="amber">Confirming your payment...</Notice> : null}
      <FormError message={error} />

      {order.status === "pending_payment" ? (
        <div className="flex flex-wrap items-center justify-between gap-4 border border-accent bg-accent/10 px-5 py-4 text-sm">
          <span>
            <b>Waiting for payment.</b>
            {order.expiresAt ? ` Your items are held until ${formatDateTime(order.expiresAt)}.` : ""}
          </span>
          {order.canPay ? (
            <button type="button" className="btn btn-primary justify-between gap-6" disabled={pending} onClick={pay}>
              <span>Pay {formatInr(order.pricing.total)}</span>
              <span aria-hidden>→</span>
            </button>
          ) : null}
        </div>
      ) : null}

      <div className="grid border-y border-divider sm:grid-cols-3">
        <Stat label={justPlaced ? "Placed" : "Items"} value={justPlaced ? formatDate(order.createdAt) : String(count)} />
        <Stat label="Paid with" value={paid} />
        <Stat label="Total" value={formatInr(order.pricing.total)} />
      </div>

      <div className="grid gap-12 md:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <section className="flex flex-col gap-5">
          <h2 className={label}>Progress</h2>
          <OrderTimeline order={order} />
          {order.cancelReason ? <p className="m-0 text-sm text-foreground/65">Reason: {order.cancelReason}</p> : null}
          {order.tracking ? (
            <p className="m-0 text-sm">
              Shipped with {order.tracking.carrier} · <span className="font-mono">{order.tracking.number}</span>
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
        </section>
        <section className="flex flex-col">
          <h2 className={`${label} mb-2`}>In this order · {count}</h2>
          {order.items.map((item) => (
            <div key={item.sku} className="flex items-center gap-4 border-b border-divider py-3.5">
              <Link href={to(`/products/${item.slug}`)} aria-label={item.title}>
                <Thumb src={item.image} size={64} />
              </Link>
              <span className="flex min-w-0 flex-1 flex-col">
                <Link href={to(`/products/${item.slug}`)} className="vk-link truncate font-medium">
                  {item.title}
                </Link>
                <span className="text-[13px] opacity-60">
                  {Object.values(item.options).join(" · ")}
                  {Object.keys(item.options).length ? " " : ""}× {item.quantity}
                </span>
              </span>
              <span className="tabular-nums">{formatInr(item.lineTotal)}</span>
            </div>
          ))}
          <div className="flex flex-col gap-2 pt-4 text-sm">
            <SummaryRow label="Subtotal" value={formatInr(order.pricing.subtotal)} />
            <SummaryRow label="Shipping" value={order.pricing.shipping ? formatInr(order.pricing.shipping) : "Free"} />
            {order.payment.amountRefunded > 0 ? <SummaryRow accent label="Refunded" value={formatInr(order.payment.amountRefunded)} /> : null}
          </div>
          <div className="mt-3 flex items-baseline justify-between border-t border-divider pt-3">
            <b>Total</b>
            <span className="font-heading text-[30px] tabular-nums">{formatInr(order.pricing.total)}</span>
          </div>
        </section>
      </div>

      <section className="flex flex-col gap-2 border-t border-divider pt-6 text-sm">
        <h2 className={label}>Ship to</h2>
        <address className="not-italic leading-relaxed">
          <b className="font-semibold">{address.fullName}</b>
          <br />
          {address.line1}
          {address.line2 ? `, ${address.line2}` : ""}
          <br />
          {address.city}, {address.state} {address.postalCode}
          <br />
          <span className="opacity-65">{address.phone}</span>
        </address>
      </section>

      <div className="flex flex-wrap gap-3">
        {justPlaced ? (
          <>
            <Link href={to("/account/orders")} className="btn btn-primary min-h-[52px] min-w-[200px] justify-between text-base">
              <span>Track orders</span>
              <span aria-hidden>→</span>
            </Link>
            <Link href={to("/products")} className="btn btn-secondary min-h-[52px] text-base">
              Continue shopping
            </Link>
          </>
        ) : null}
        {order.canCancel ? (
          <button type="button" className="btn btn-ghost" disabled={pending} onClick={cancel}>
            Cancel order
          </button>
        ) : null}
      </div>
      <p className="sr-only" aria-live="polite">
        {ORDER_STATUS_LABELS[order.status]}
      </p>
    </div>
  );
}

function Stat({ label: title, value }: { label: string; value: string }) {
  return (
    <div className="py-5 sm:pr-6">
      <div className="text-xs opacity-60">{title}</div>
      <div className="font-heading text-[26px] leading-tight">{value}</div>
    </div>
  );
}
