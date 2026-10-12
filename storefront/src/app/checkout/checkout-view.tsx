"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { AddressForm } from "@/components/address-form";
import { FormError } from "@/components/form-field";
import { Button, Loading, Notice, ProductPhoto, buttonClass } from "@/components/ui";
import { ApiError } from "@/lib/api";
import { errorMessage } from "@/lib/auth";
import { refreshCart, useCart } from "@/lib/cart";
import { formatInr } from "@/lib/money";
import { startPayment } from "@/lib/payments";
import { useSession } from "@/lib/session";
import { PAYMENT_METHOD_LABELS, shopApi, type Address, type CheckoutConfig, type PaymentMethod } from "@/lib/shop-api";

export function CheckoutView() {
  const router = useRouter();
  const user = useSession();
  const { cart, signedIn } = useCart();
  const [addresses, setAddresses] = useState<Address[] | null>(null);
  const [config, setConfig] = useState<CheckoutConfig | null>(null);
  const [addressId, setAddressId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [method, setMethod] = useState<PaymentMethod | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // One key per checkout attempt: a double click or a retried request returns the same order instead of a second one.
  const attemptKey = useRef<string | null>(null);

  useEffect(() => {
    if (user === null) router.replace("/login?next=/checkout");
  }, [user, router]);

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
      <div className="flex flex-col items-center gap-4 py-16 text-center">
        <p className="text-black/60 dark:text-white/60">Your cart is empty.</p>
        <Link href="/products" className={buttonClass("primary")}>
          Continue shopping
        </Link>
      </div>
    );
  }

  const shipping = cart.subtotal >= config.shipping.freeFrom ? 0 : config.shipping.fee;
  const total = cart.subtotal + shipping;
  const codBlocked = total > config.codMaxTotal;

  async function placeOrder() {
    if (!addressId || !method) return;
    setPending(true);
    setError(null);
    attemptKey.current ??= crypto.randomUUID();
    try {
      const { order, payment } = await shopApi.placeOrder({ addressId, paymentMethod: method, idempotencyKey: attemptKey.current });
      await refreshCart();
      if (!payment) {
        router.push(`/account/orders/${order.id}?placed=1`);
        return;
      }
      const outcome = await startPayment(order, payment);
      if (outcome === "redirecting") return;
      router.push(`/account/orders/${order.id}${outcome === "paid" ? "?placed=1" : ""}`);
    } catch (err) {
      setError(errorMessage(err));
      // A definite refusal (stock, cart, validation) means the next click is a new attempt; a network error may have
      // created the order, so the same key is kept and a retry returns it.
      if (err instanceof ApiError && err.status < 500) attemptKey.current = null;
      if (err instanceof ApiError && (err.code === "CART_HAS_ISSUES" || err.code === "OUT_OF_STOCK")) await refreshCart();
      setPending(false);
    }
  }

  return (
    <div className="grid gap-8 md:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="flex flex-col gap-8">
        <section>
          <h2 className="mb-3 text-lg font-semibold">1. Delivery address</h2>
          {addresses.length ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {addresses.map((address) => (
                <label key={address.id} className={`flex cursor-pointer gap-3 rounded-lg border p-4 text-sm ${addressId === address.id ? "border-foreground" : "border-black/10 dark:border-white/10"}`}>
                  <input type="radio" name="address" checked={addressId === address.id} onChange={() => setAddressId(address.id)} className="mt-1" />
                  <span>
                    <span className="font-medium">{address.fullName}</span>
                    <br />
                    {address.line1}
                    {address.line2 ? `, ${address.line2}` : ""}
                    <br />
                    {address.city}, {address.state} {address.postalCode}
                    <br />
                    <span className="text-black/60 dark:text-white/60">{address.phone}</span>
                  </span>
                </label>
              ))}
            </div>
          ) : null}
          {adding ? (
            <div className="mt-4 rounded-lg border border-black/10 p-4 dark:border-white/10">
              <AddressForm
                onSaved={(address) => {
                  setAddresses([...addresses.map((item) => (address.isDefault ? { ...item, isDefault: false } : item)), address]);
                  setAddressId(address.id);
                  setAdding(false);
                }}
                onCancel={addresses.length ? () => setAdding(false) : undefined}
              />
            </div>
          ) : (
            <Button className="mt-3" onClick={() => setAdding(true)}>
              Add a new address
            </Button>
          )}
        </section>

        <section>
          <h2 className="mb-3 text-lg font-semibold">2. Payment</h2>
          <div className="flex flex-col gap-2">
            {config.methods.map((option) => {
              const disabled = option === "cod" && codBlocked;
              return (
                <label key={option} className={`flex items-center gap-3 rounded-lg border p-4 text-sm ${method === option ? "border-foreground" : "border-black/10 dark:border-white/10"} ${disabled ? "opacity-50" : "cursor-pointer"}`}>
                  <input type="radio" name="method" disabled={disabled} checked={method === option} onChange={() => setMethod(option)} />
                  <span>
                    <span className="font-medium">{PAYMENT_METHOD_LABELS[option]}</span>
                    {option === "cod" ? <span className="block text-xs text-black/60 dark:text-white/60">{disabled ? `Not available above ${formatInr(config.codMaxTotal)}` : "Pay in cash or UPI when the parcel arrives"}</span> : null}
                    {option !== "cod" ? <span className="block text-xs text-black/60 dark:text-white/60">Your items are held for {config.paymentWindowMinutes} minutes while you pay</span> : null}
                  </span>
                </label>
              );
            })}
          </div>
        </section>
      </div>

      <aside className="flex h-fit flex-col gap-3 rounded-lg border border-black/10 p-5 text-sm dark:border-white/10">
        <h2 className="font-semibold">Order summary</h2>
        <ul className="flex flex-col gap-3">
          {cart.lines.map((line) => (
            <li key={line.sku} className="flex gap-3">
              <ProductPhoto src={line.image?.url} alt={line.title} className="h-14 w-12 shrink-0 rounded" />
              <span className="min-w-0 flex-1">
                <span className="line-clamp-1">{line.title}</span>
                <span className="text-xs text-black/60 dark:text-white/60">
                  {Object.values(line.options).join(" / ")} × {line.quantity}
                </span>
                {line.status !== "ok" ? <span className="block text-xs text-red-600">{line.status === "unavailable" ? "Unavailable" : `Only ${line.available} left`}</span> : null}
              </span>
              <span className="tabular-nums">{formatInr(line.lineTotal)}</span>
            </li>
          ))}
        </ul>
        <div className="flex justify-between border-t border-black/10 pt-3 dark:border-white/10">
          <span>Subtotal</span>
          <span className="tabular-nums">{formatInr(cart.subtotal)}</span>
        </div>
        <div className="flex justify-between">
          <span>Shipping</span>
          <span className="tabular-nums">{shipping ? formatInr(shipping) : "Free"}</span>
        </div>
        <div className="flex justify-between border-t border-black/10 pt-3 text-base font-semibold dark:border-white/10">
          <span>Total</span>
          <span className="tabular-nums">{formatInr(total)}</span>
        </div>
        {cart.hasIssues ? (
          <Notice tone="amber">
            Some items changed. <Link href="/cart" className="underline">Review your cart</Link>.
          </Notice>
        ) : null}
        <FormError message={error} />
        <Button variant="primary" className="py-2.5" disabled={pending || !addressId || !method || cart.hasIssues || adding} onClick={placeOrder}>
          {pending ? "Placing order..." : method === "cod" ? `Place order · ${formatInr(total)}` : `Pay ${formatInr(total)}`}
        </Button>
        <p className="text-xs text-black/50 dark:text-white/50">Prices include GST. Payments are processed securely by Razorpay or Stripe; we never see your card details.</p>
      </aside>
    </div>
  );
}
