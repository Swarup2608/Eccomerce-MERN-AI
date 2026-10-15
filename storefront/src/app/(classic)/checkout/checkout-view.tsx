"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { AddressForm } from "@/components/address-form";
import { FormError } from "@/components/form-field";
import { EmptyState, Loading, LockIcon, Notice, SummaryRow } from "@/components/ui";
import { ApiError } from "@/lib/api";
import { errorMessage } from "@/lib/auth";
import { refreshCart, useCart } from "@/lib/cart";
import { formatInr } from "@/lib/money";
import { startPayment } from "@/lib/payments";
import { useSession } from "@/lib/session";
import { PAYMENT_METHOD_LABELS, shopApi, type Address, type CheckoutConfig, type PaymentMethod } from "@/lib/shop-api";
import { useHref } from "@/lib/base-path";

const STEPS = ["Delivery", "Payment", "Review"] as const;
const sectionLabel = "text-xs font-semibold uppercase tracking-[0.14em]";

const oneLine = (address: Address) => [address.line1, address.line2, address.city, `${address.state} ${address.postalCode}`].filter(Boolean).join(", ");

export function CheckoutView() {
  const to = useHref();
  const router = useRouter();
  const user = useSession();
  const { cart, signedIn } = useCart();
  const [addresses, setAddresses] = useState<Address[] | null>(null);
  const [config, setConfig] = useState<CheckoutConfig | null>(null);
  const [addressId, setAddressId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [method, setMethod] = useState<PaymentMethod | null>(null);
  const [step, setStep] = useState(0);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // One key per checkout attempt: a double click or a retried request returns the same order instead of a second one.
  const attemptKey = useRef<string | null>(null);

  useEffect(() => {
    if (user === null) router.replace(to(`/login?next=${to("/checkout")}`));
  }, [user, router, to]);

  useEffect(() => {
    if (!user) return;
    let current = true;
    Promise.all([shopApi.addresses(), shopApi.checkoutConfig()]).then(
      ([loadedAddresses, loadedConfig]) => {
        if (!current) return;
        setAddresses(loadedAddresses);
        setAddressId(loadedAddresses.find((address) => address.isDefault)?.id ?? loadedAddresses[0]?.id ?? null);
        setAdding(loadedAddresses.length === 0);
        setConfig(loadedConfig);
        setMethod(loadedConfig.methods[0] ?? null);
      },
      (err: unknown) => current && setError(errorMessage(err)),
    );
    return () => {
      current = false;
    };
  }, [user]);

  if (!user || signedIn === undefined || !addresses || !config) return error ? <FormError message={error} /> : <Loading />;

  if (cart.lines.length === 0) {
    return (
      <EmptyState title="Your bag is empty." text="Add something you love, then come back to check out.">
        <Link href={to("/products")} className="btn btn-primary">
          Continue shopping
        </Link>
      </EmptyState>
    );
  }

  const shipping = cart.subtotal >= config.shipping.freeFrom ? 0 : config.shipping.fee;
  const total = cart.subtotal + shipping;
  const codBlocked = total > config.codMaxTotal;
  const address = addresses.find((item) => item.id === addressId) ?? null;
  const canAdvance = step === 0 ? Boolean(addressId) && !adding : step === 1 ? Boolean(method) && !(method === "cod" && codBlocked) : !cart.hasIssues;

  async function placeOrder() {
    if (!addressId || !method) return;
    setPending(true);
    setError(null);
    attemptKey.current ??= crypto.randomUUID();
    try {
      const { order, payment } = await shopApi.placeOrder({ addressId, paymentMethod: method, idempotencyKey: attemptKey.current });
      await refreshCart();
      if (!payment) {
        router.push(to(`/account/orders/${order.id}?placed=1`));
        return;
      }
      const outcome = await startPayment(order, payment);
      if (outcome === "redirecting") return;
      router.push(to(`/account/orders/${order.id}${outcome === "paid" ? "?placed=1" : ""}`));
    } catch (err) {
      setError(errorMessage(err));
      // A definite refusal (stock, cart, validation) means the next click is a new attempt; a network error may have
      // created the order, so the same key is kept and a retry returns it.
      if (err instanceof ApiError && err.status < 500) attemptKey.current = null;
      if (err instanceof ApiError && (err.code === "CART_HAS_ISSUES" || err.code === "OUT_OF_STOCK")) await refreshCart();
      setPending(false);
    }
  }

  function next() {
    setError(null);
    if (step < 2) setStep(step + 1);
    else void placeOrder();
  }

  const nextLabel = step === 0 ? "Continue to payment" : step === 1 ? "Review order" : pending ? "Placing order..." : method === "cod" ? `Place order · ${formatInr(total)}` : `Pay ${formatInr(total)}`;

  return (
    <>
      <ol className="mb-10 grid grid-cols-3 gap-3">
        {STEPS.map((label, index) => (
          <li key={label}>
            <button type="button" disabled={index > step || pending} onClick={() => setStep(index)} aria-current={index === step ? "step" : undefined} className={`flex w-full flex-col gap-2.5 text-left disabled:cursor-default ${index <= step ? "text-foreground" : "text-foreground/45"}`}>
              <span className={`h-[3px] w-full transition-colors duration-400 ${index <= step ? "bg-accent" : "bg-divider"}`} />
              <span className={`text-sm ${index === step ? "font-semibold" : ""}`}>
                0{index + 1} — {label}
              </span>
            </button>
          </li>
        ))}
      </ol>

      <div className="grid items-start gap-12 lg:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]">
        <div className="flex min-w-0 flex-col gap-7">
          {step === 0 ? (
            <>
              <h2 className="m-0 text-[40px] leading-none">Where should we ship it?</h2>
              {addresses.length ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  {addresses.map((item) => (
                    <label key={item.id} className="vk-choice text-sm">
                      <input type="radio" name="address" checked={addressId === item.id} onChange={() => setAddressId(item.id)} />
                      <span className="dot" />
                      <span className="flex flex-col gap-0.5">
                        <b className="font-semibold">
                          {item.fullName}
                          {item.isDefault ? <span className="tag tag-outline ml-2 align-middle">Default</span> : null}
                        </b>
                        <span>{oneLine(item)}</span>
                        <span className="text-foreground/60">{item.phone}</span>
                      </span>
                    </label>
                  ))}
                </div>
              ) : null}
              {adding ? (
                <div className="border border-divider p-6">
                  <p className={`${sectionLabel} mb-4`}>New address</p>
                  <AddressForm
                    onSaved={(saved) => {
                      setAddresses([...addresses.map((item) => (saved.isDefault ? { ...item, isDefault: false } : item)), saved]);
                      setAddressId(saved.id);
                      setAdding(false);
                    }}
                    onCancel={addresses.length ? () => setAdding(false) : undefined}
                  />
                </div>
              ) : (
                <button type="button" className="btn btn-secondary self-start" onClick={() => setAdding(true)}>
                  + Add a new address
                </button>
              )}
              <div className="flex flex-col gap-2.5">
                <p className={sectionLabel}>Delivery</p>
                <div className="vk-choice cursor-default justify-between">
                  <span className="flex flex-col">
                    <b className="font-semibold">Standard delivery</b>
                    <span className="text-[13px] opacity-65">{shipping ? `Free on orders over ${formatInr(config.shipping.freeFrom)}` : "Your order qualifies for free shipping"}</span>
                  </span>
                  <span className="font-semibold">{shipping ? formatInr(shipping) : "Free"}</span>
                </div>
              </div>
            </>
          ) : null}

          {step === 1 ? (
            <>
              <h2 className="m-0 text-[40px] leading-none">How would you like to pay?</h2>
              <div className="grid gap-3 sm:grid-cols-2">
                {config.methods.map((option) => {
                  const disabled = option === "cod" && codBlocked;
                  return (
                    <label key={option} className="vk-choice text-sm">
                      <input type="radio" name="method" disabled={disabled} checked={method === option} onChange={() => setMethod(option)} />
                      <span className="dot" />
                      <span className="flex flex-col gap-0.5">
                        <b className="font-semibold">{PAYMENT_METHOD_LABELS[option]}</b>
                        <span className="text-[13px] opacity-65">
                          {option === "cod" ? (disabled ? `Not available above ${formatInr(config.codMaxTotal)}` : "Pay in cash or UPI when the parcel arrives") : `Your items are held for ${config.paymentWindowMinutes} minutes while you pay`}
                        </span>
                      </span>
                    </label>
                  );
                })}
              </div>
              <div className="border border-dashed border-divider p-6 text-[15px]">
                {method === "cod" ? (
                  <>
                    You’ll pay <b>{formatInr(total)}</b> to the courier on delivery. Nothing is charged now.
                  </>
                ) : (
                  <>
                    You’ll confirm <b>{method ? PAYMENT_METHOD_LABELS[method] : "payment"}</b> after placing the order. Payments are processed securely; we never see your card details.
                  </>
                )}
              </div>
            </>
          ) : null}

          {step === 2 ? (
            <>
              <h2 className="m-0 text-[40px] leading-none">Review and place order</h2>
              <div className="border-t border-divider">
                <ReviewRow label="Ship to" onEdit={() => setStep(0)}>
                  <span>{address ? `${address.fullName}, ${oneLine(address)}` : "No address chosen"}</span>
                  <span className="text-[13px] opacity-65">{address?.phone}</span>
                </ReviewRow>
                <ReviewRow label="Delivery" onEdit={() => setStep(0)}>
                  <span>Standard delivery · {shipping ? formatInr(shipping) : "Free"}</span>
                </ReviewRow>
                <ReviewRow label="Payment" onEdit={() => setStep(1)}>
                  <span>{method ? PAYMENT_METHOD_LABELS[method] : "Not chosen"}</span>
                </ReviewRow>
              </div>
              {cart.hasIssues ? (
                <Notice tone="amber">
                  Some items changed.{" "}
                  <Link href={to("/cart")} className="underline">
                    Review your bag
                  </Link>
                  .
                </Notice>
              ) : null}
            </>
          ) : null}

          <FormError message={error} />

          <div className="flex flex-wrap justify-between gap-3 pt-2">
            {step > 0 ? (
              <button type="button" className="btn btn-secondary min-h-[52px] min-w-[140px]" disabled={pending} onClick={() => setStep(step - 1)}>
                ← Back
              </button>
            ) : (
              <Link href={to("/cart")} className="btn btn-secondary min-h-[52px] min-w-[140px]">
                ← Bag
              </Link>
            )}
            <button type="button" className="btn btn-primary min-h-[52px] min-w-[260px] justify-between text-base" disabled={!canAdvance || pending} onClick={next}>
              <span>{nextLabel}</span>
              <span aria-hidden>→</span>
            </button>
          </div>
        </div>

        <aside className="flex flex-col gap-3.5 border border-divider p-6 lg:sticky lg:top-36">
          <h3 className="m-0 text-2xl">In your bag · {cart.itemCount}</h3>
          <ul className="flex flex-col gap-3">
            {cart.lines.map((line) => (
              <li key={line.sku} className="flex items-center gap-3 text-sm">
                <span className="relative block size-[52px] flex-none overflow-hidden bg-surface">
                  {line.image?.url ? <span role="img" aria-label="" className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url(${line.image.url})` }} /> : null}
                </span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate font-medium">{line.title}</span>
                  <span className="text-xs opacity-60">
                    {Object.values(line.options).join(" · ")}
                    {Object.keys(line.options).length ? " " : ""}× {line.quantity}
                  </span>
                  {line.status !== "ok" ? <span className="text-xs text-accent-700">{line.status === "unavailable" ? "Unavailable" : `Only ${line.available} left`}</span> : null}
                </span>
                <span className="tabular-nums">{formatInr(line.lineTotal)}</span>
              </li>
            ))}
          </ul>
          <div className="flex flex-col gap-2 border-t border-divider pt-3.5 text-sm">
            <SummaryRow label="Subtotal" value={formatInr(cart.subtotal)} />
            <SummaryRow label="Shipping" value={shipping ? formatInr(shipping) : "Free"} />
          </div>
          <div className="flex items-baseline justify-between border-t border-divider pt-3.5">
            <b>Total</b>
            <span className="font-heading text-[30px] tabular-nums">{formatInr(total)}</span>
          </div>
          <span className="flex items-center gap-2 text-xs opacity-65">
            <LockIcon />
            Prices include GST · Secure payment
          </span>
        </aside>
      </div>
    </>
  );
}

function ReviewRow({ label, onEdit, children }: { label: string; onEdit: () => void; children: ReactNode }) {
  return (
    <div className="flex justify-between gap-4 border-b border-divider py-[18px]">
      <span className="flex flex-col gap-1">
        <span className="text-xs uppercase tracking-[0.14em] opacity-60">{label}</span>
        {children}
      </span>
      <button type="button" className="btn btn-ghost self-start" onClick={onEdit}>
        Edit
      </button>
    </div>
  );
}
