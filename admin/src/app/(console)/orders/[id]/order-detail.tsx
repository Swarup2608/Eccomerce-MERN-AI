"use client";

import Link from "next/link";
import { useCallback, useState, type FormEvent } from "react";
import { FormError } from "@/components/form-field";
import { Button, Card, Field, Input, Loading, Notice, PageHeader, StatusPill, Thumb } from "@/components/ui";
import { adminApi, ORDER_STATUS_LABELS, PAYMENT_METHOD_LABELS, PAYMENT_STATUS_LABELS, type Order, type OrderStatus } from "@/lib/admin-api";
import { errorMessage } from "@/lib/auth";
import { formatDate, formatInr, paiseToRupees, rupeesToPaise } from "@/lib/money";
import { useLoad } from "@/lib/use-load";
import { confirmDialog } from "@/components/dialog";

const ACTION_LABELS: Record<OrderStatus, string> = {
  pending_payment: "Awaiting payment",
  confirmed: "Confirm",
  processing: "Start processing",
  shipped: "Mark shipped",
  delivered: "Mark delivered",
  cancelled: "Cancel order",
  returned: "Mark returned",
};

export function OrderDetail({ orderId }: { orderId: string }) {
  const load = useCallback(() => adminApi.order(orderId), [orderId]);
  const { data: order, error: loadError, setData } = useLoad(load);
  const [action, setAction] = useState<OrderStatus | "refund" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  if (!order) return loadError ? <FormError message={loadError} /> : <Loading />;

  const done = (updated: Order, message: string) => {
    setData(updated);
    setAction(null);
    setError(null);
    setNotice(message);
  };

  return (
    <>
      <PageHeader
        title={order.orderNumber}
        description={`Placed ${formatDate(order.createdAt)} by ${order.customer.name}`}
        actions={
          <>
            <StatusPill status={order.status} label={ORDER_STATUS_LABELS[order.status]} />
            <StatusPill status={order.payment.status} label={PAYMENT_STATUS_LABELS[order.payment.status]} />
          </>
        }
      />
      {notice ? <div className="mb-4"><Notice>{notice}</Notice></div> : null}
      <FormError message={error} />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="flex flex-col gap-6">
          <Card title="Items">
            <ul className="divide-y divide-black/10 dark:divide-white/10">
              {order.items.map((item) => (
                <li key={item.sku} className="flex items-center gap-3 py-3 text-sm">
                  <Thumb src={item.image} alt={item.title} size={48} />
                  <div className="min-w-0 flex-1">
                    <Link href={`/products/${item.productId}`} className="font-medium hover:underline">
                      {item.title}
                    </Link>
                    <p className="text-xs text-black/50 dark:text-white/50">
                      {Object.values(item.options).join(" / ") || "Standard"} · <span className="font-mono">{item.sku}</span>
                    </p>
                  </div>
                  <span className="tabular-nums text-black/60 dark:text-white/60">
                    {item.quantity} × {formatInr(item.unitPrice)}
                  </span>
                  <span className="w-24 text-right tabular-nums">{formatInr(item.lineTotal)}</span>
                </li>
              ))}
            </ul>
            <dl className="mt-3 flex flex-col gap-1 border-t border-black/10 pt-3 text-sm dark:border-white/10">
              <Row label="Subtotal" value={formatInr(order.pricing.subtotal)} />
              <Row label="Shipping" value={order.pricing.shipping ? formatInr(order.pricing.shipping) : "Free"} />
              <Row label="Total" value={formatInr(order.pricing.total)} strong />
            </dl>
          </Card>

          <Card title="Actions">
            {order.allowedTransitions.length === 0 && order.refundable === 0 ? <p className="text-sm text-black/50 dark:text-white/50">No further actions for this order.</p> : null}
            <div className="flex flex-wrap gap-2">
              {order.allowedTransitions.map((status) => (
                <Button key={status} variant={status === "cancelled" ? "danger" : action === status ? "primary" : "secondary"} onClick={() => setAction(action === status ? null : status)}>
                  {ACTION_LABELS[status]}
                </Button>
              ))}
              {order.refundable > 0 ? (
                <Button variant={action === "refund" ? "primary" : "secondary"} onClick={() => setAction(action === "refund" ? null : "refund")}>
                  Refund
                </Button>
              ) : null}
            </div>
            {action === "refund" ? <RefundForm order={order} onDone={done} onError={setError} /> : action ? <StatusForm order={order} status={action} onDone={done} onError={setError} /> : null}
          </Card>

          <Card title="Timeline">
            <ol className="flex flex-col gap-3 text-sm">
              {[...order.statusHistory].reverse().map((entry, index) => (
                <li key={`${entry.at}-${index}`} className="flex gap-3">
                  <span className="mt-1.5 size-2 shrink-0 rounded-full bg-foreground/60" aria-hidden />
                  <div>
                    <p className="font-medium">
                      {ORDER_STATUS_LABELS[entry.status]} <span className="font-normal text-black/50 dark:text-white/50">· {entry.by}</span>
                    </p>
                    <p className="text-xs text-black/50 dark:text-white/50">{formatDate(entry.at)}</p>
                    {entry.note ? <p className="mt-0.5 text-black/70 dark:text-white/70">{entry.note}</p> : null}
                  </div>
                </li>
              ))}
            </ol>
          </Card>
        </div>

        <div className="flex flex-col gap-6">
          <Card title="Customer">
            <p className="text-sm font-medium">
              <Link href={`/customers/${order.userId}`} className="hover:underline">
                {order.customer.name}
              </Link>
            </p>
            <p className="text-sm text-black/60 dark:text-white/60">{order.customer.email}</p>
            <p className="text-sm text-black/60 dark:text-white/60">{order.customer.phone}</p>
          </Card>
          <Card title="Ship to">
            <address className="text-sm not-italic leading-relaxed">
              {order.shippingAddress.fullName}
              <br />
              {order.shippingAddress.line1}
              {order.shippingAddress.line2 ? <><br />{order.shippingAddress.line2}</> : null}
              {order.shippingAddress.landmark ? <><br />Near {order.shippingAddress.landmark}</> : null}
              <br />
              {order.shippingAddress.city}, {order.shippingAddress.state} {order.shippingAddress.postalCode}
              <br />
              {order.shippingAddress.phone}
            </address>
            {order.tracking ? (
              <p className="mt-3 border-t border-black/10 pt-3 text-sm dark:border-white/10">
                {order.tracking.carrier} · <span className="font-mono">{order.tracking.number}</span>
                {order.tracking.url ? (
                  <>
                    {" "}
                    <a href={order.tracking.url} target="_blank" rel="noreferrer noopener" className="underline">
                      Track
                    </a>
                  </>
                ) : null}
              </p>
            ) : null}
          </Card>
          <Card title="Payment">
            <dl className="flex flex-col gap-1 text-sm">
              <Row label="Method" value={PAYMENT_METHOD_LABELS[order.payment.method]} />
              <Row label="Status" value={PAYMENT_STATUS_LABELS[order.payment.status]} />
              <Row label="Paid" value={formatInr(order.payment.amountPaid)} />
              <Row label="Refunded" value={formatInr(order.payment.amountRefunded)} />
              {order.payment.paidAt ? <Row label="Paid at" value={formatDate(order.payment.paidAt)} /> : null}
              {order.payment.providerPaymentId ? <Row label="Payment id" value={order.payment.providerPaymentId} mono /> : null}
              {order.expiresAt && order.status === "pending_payment" ? <Row label="Expires" value={formatDate(order.expiresAt)} /> : null}
            </dl>
            {order.payment.lastError ? <p className="mt-2 text-xs text-red-600">{order.payment.lastError}</p> : null}
            {order.payment.refunds.length ? (
              <ul className="mt-3 flex flex-col gap-2 border-t border-black/10 pt-3 text-xs dark:border-white/10">
                {order.payment.refunds.map((refund) => (
                  <li key={refund.refundId}>
                    <span className="font-medium">{formatInr(refund.amount)}</span> · {refund.status} · {formatDate(refund.createdAt)}
                    <p className="text-black/50 dark:text-white/50">{refund.reason}</p>
                  </li>
                ))}
              </ul>
            ) : null}
          </Card>
        </div>
      </div>
    </>
  );
}

function Row({ label, value, strong, mono }: { label: string; value: string; strong?: boolean; mono?: boolean }) {
  return (
    <div className={`flex justify-between gap-4 ${strong ? "font-semibold" : ""}`}>
      <dt className="text-black/60 dark:text-white/60">{label}</dt>
      <dd className={`text-right tabular-nums ${mono ? "break-all font-mono text-xs" : ""}`}>{value}</dd>
    </div>
  );
}

function StatusForm({ order, status, onDone, onError }: { order: Order; status: OrderStatus; onDone: (order: Order, message: string) => void; onError: (message: string | null) => void }) {
  const [note, setNote] = useState("");
  const [tracking, setTracking] = useState({ carrier: "", number: "", url: "" });
  const [pending, setPending] = useState(false);
  const paid = order.refundable > 0;

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    try {
      const updated = await adminApi.updateOrderStatus(order.id, { status, note, ...(status === "shipped" ? { tracking } : {}) });
      onDone(updated, `Order marked ${ORDER_STATUS_LABELS[status].toLowerCase()}.`);
    } catch (err) {
      onError(errorMessage(err));
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="mt-4 flex flex-col gap-3 rounded-md border border-black/10 p-4 dark:border-white/10">
      {status === "shipped" ? (
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Carrier">
            <Input required maxLength={60} value={tracking.carrier} onChange={(event) => setTracking({ ...tracking, carrier: event.target.value })} placeholder="Delhivery" />
          </Field>
          <Field label="Tracking number">
            <Input required maxLength={60} value={tracking.number} onChange={(event) => setTracking({ ...tracking, number: event.target.value })} />
          </Field>
          <Field label="Tracking link" hint="Optional, https only.">
            <Input type="url" pattern="https://.*" value={tracking.url} onChange={(event) => setTracking({ ...tracking, url: event.target.value })} />
          </Field>
        </div>
      ) : null}
      {status === "cancelled" ? <p className="text-sm text-red-700 dark:text-red-300">Cancelling puts the stock back{paid ? ` and refunds ${formatInr(order.refundable)} to the customer` : ""}. This cannot be undone.</p> : null}
      {status === "returned" ? <p className="text-sm text-black/60 dark:text-white/60">The items go back into stock. Refund the customer separately.</p> : null}
      <Field label={status === "cancelled" ? "Reason (shown to the customer)" : "Note (internal)"}>
        <Input maxLength={300} required={status === "cancelled"} value={note} onChange={(event) => setNote(event.target.value)} />
      </Field>
      <div>
        <Button type="submit" variant={status === "cancelled" ? "danger" : "primary"} disabled={pending}>
          {pending ? "Saving..." : ACTION_LABELS[status]}
        </Button>
      </div>
    </form>
  );
}

function RefundForm({ order, onDone, onError }: { order: Order; onDone: (order: Order, message: string) => void; onError: (message: string | null) => void }) {
  const [amount, setAmount] = useState(paiseToRupees(order.refundable));
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const paise = rupeesToPaise(amount);
    if (paise === null || paise <= 0 || paise > order.refundable) return onError(`Enter an amount up to ${formatInr(order.refundable)}`);
    if (!(await confirmDialog({ title: `Refund ${formatInr(paise)}?`, message: `The refund goes to ${order.customer.name}${reason ? ` · “${reason}”` : ""}. This can’t be undone.`, confirmLabel: "Issue refund", tone: "danger" }))) return;
    setPending(true);
    try {
      const updated = await adminApi.refundOrder(order.id, { amount: paise, reason });
      onDone(updated, `Refund of ${formatInr(paise)} issued.`);
    } catch (err) {
      onError(errorMessage(err));
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="mt-4 flex flex-col gap-3 rounded-md border border-black/10 p-4 dark:border-white/10">
      <p className="text-sm text-black/60 dark:text-white/60">
        {order.payment.method === "cod" ? "Cash on Delivery refunds are paid outside the system; this records it." : `Refunded to the original payment through ${PAYMENT_METHOD_LABELS[order.payment.method]}.`} Up to {formatInr(order.refundable)}.
      </p>
      <div className="grid gap-3 sm:grid-cols-[10rem_1fr]">
        <Field label="Amount (₹)">
          <Input required inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} />
        </Field>
        <Field label="Reason">
          <Input required maxLength={300} value={reason} onChange={(event) => setReason(event.target.value)} />
        </Field>
      </div>
      <div>
        <Button type="submit" variant="primary" disabled={pending}>
          {pending ? "Refunding..." : "Issue refund"}
        </Button>
      </div>
    </form>
  );
}
