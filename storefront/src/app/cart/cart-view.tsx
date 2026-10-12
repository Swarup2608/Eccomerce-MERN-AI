"use client";

import Link from "next/link";
import { useState } from "react";
import { FormError } from "@/components/form-field";
import { Loading, Notice, ProductPhoto, buttonClass } from "@/components/ui";
import { errorMessage } from "@/lib/auth";
import { setLineQuantity, useCart } from "@/lib/cart";
import { formatInr } from "@/lib/money";

const FREE_SHIPPING_FROM = 49_900;
const SHIPPING_FEE = 4_900;

export function CartView() {
  const { cart, signedIn } = useCart();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function change(sku: string, quantity: number) {
    setBusy(sku);
    setError(null);
    try {
      await setLineQuantity(sku, quantity);
    } catch (err) {
      setError(errorMessage(err));
    }
    setBusy(null);
  }

  if (signedIn === undefined) return <Loading />;
  if (cart.lines.length === 0) {
    return (
      <div className="flex flex-col items-center gap-4 py-16 text-center">
        <p className="text-black/60 dark:text-white/60">Your cart is empty.</p>
        <Link href="/products" className={buttonClass("primary")}>
          Start shopping
        </Link>
      </div>
    );
  }

  const shipping = cart.subtotal >= FREE_SHIPPING_FROM ? 0 : SHIPPING_FEE;

  return (
    <div className="grid gap-8 md:grid-cols-[minmax(0,1fr)_18rem]">
      <div className="flex flex-col gap-4">
        {cart.hasIssues ? <Notice tone="amber">Some items changed since you added them. Update or remove them to continue.</Notice> : null}
        <FormError message={error} />
        <ul className="divide-y divide-black/10 dark:divide-white/10">
          {cart.lines.map((line) => (
            <li key={line.sku} className={`flex gap-4 py-4 ${busy === line.sku ? "opacity-60" : ""}`}>
              <Link href={`/products/${line.slug}`} className="shrink-0">
                <ProductPhoto src={line.image?.url} alt={line.image?.alt || line.title} className="h-28 w-24 rounded-md" />
              </Link>
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <Link href={`/products/${line.slug}`} className="font-medium hover:underline">
                  {line.title}
                </Link>
                {Object.keys(line.options).length ? <p className="text-sm text-black/60 dark:text-white/60">{Object.values(line.options).join(" / ")}</p> : null}
                <p className="text-sm tabular-nums">{formatInr(line.unitPrice)}</p>
                {line.status === "unavailable" ? <p className="text-sm text-red-600">No longer available</p> : null}
                {line.status === "insufficient_stock" ? <p className="text-sm text-amber-700 dark:text-amber-400">Only {line.available} left</p> : null}
                <div className="mt-auto flex items-center gap-3 text-sm">
                  {line.status !== "unavailable" ? (
                    <select aria-label={`Quantity of ${line.title}`} value={line.quantity} disabled={busy !== null} onChange={(event) => change(line.sku, Number(event.target.value))} className="rounded-md border border-black/15 bg-background px-2 py-1 dark:border-white/20">
                      {Array.from({ length: Math.max(line.quantity, Math.min(10, line.available)) }, (_, i) => i + 1).map((value) => (
                        <option key={value}>{value}</option>
                      ))}
                    </select>
                  ) : null}
                  <button type="button" disabled={busy !== null} onClick={() => change(line.sku, 0)} className="text-black/60 underline dark:text-white/60">
                    Remove
                  </button>
                </div>
              </div>
              <p className="font-medium tabular-nums">{formatInr(line.lineTotal)}</p>
            </li>
          ))}
        </ul>
      </div>
      <aside className="flex h-fit flex-col gap-3 rounded-lg border border-black/10 p-5 text-sm dark:border-white/10">
        <div className="flex justify-between">
          <span>Subtotal ({cart.itemCount} item{cart.itemCount === 1 ? "" : "s"})</span>
          <span className="tabular-nums">{formatInr(cart.subtotal)}</span>
        </div>
        <div className="flex justify-between">
          <span>Shipping</span>
          <span className="tabular-nums">{shipping ? formatInr(shipping) : "Free"}</span>
        </div>
        {shipping ? <p className="text-xs text-black/50 dark:text-white/50">Add {formatInr(FREE_SHIPPING_FROM - cart.subtotal)} more for free shipping.</p> : null}
        <div className="flex justify-between border-t border-black/10 pt-3 text-base font-semibold dark:border-white/10">
          <span>Total</span>
          <span className="tabular-nums">{formatInr(cart.subtotal + shipping)}</span>
        </div>
        <Link href={signedIn ? "/checkout" : "/login?next=/checkout"} aria-disabled={cart.hasIssues} className={`${buttonClass("primary")} mt-2 py-2.5 ${cart.hasIssues ? "pointer-events-none opacity-50" : ""}`}>
          {signedIn ? "Checkout" : "Sign in to check out"}
        </Link>
        <p className="text-xs text-black/50 dark:text-white/50">Prices include GST. Final prices and stock are confirmed at checkout.</p>
      </aside>
    </div>
  );
}
