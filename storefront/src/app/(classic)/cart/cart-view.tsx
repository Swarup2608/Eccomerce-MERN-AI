"use client";

import Link from "next/link";
import { useState } from "react";
import { FormError } from "@/components/form-field";
import { EmptyState, Loading, LockIcon, Notice, PageTitle, SummaryRow } from "@/components/ui";
import { errorMessage } from "@/lib/auth";
import { setLineQuantity, useCart } from "@/lib/cart";
import { formatInr } from "@/lib/money";
import { shopApi, type CartLine } from "@/lib/shop-api";
import { useHref } from "@/lib/base-path";

const FREE_SHIPPING_FROM = 49_900;
const SHIPPING_FEE = 4_900;

export function CartView() {
  const to = useHref();
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

  // Moves the product to the wishlist, then drops the line. Signed-in only: the wishlist lives on the account.
  async function saveForLater(line: CartLine) {
    setBusy(line.sku);
    setError(null);
    try {
      await shopApi.addToWishlist(line.productId);
      await setLineQuantity(line.sku, 0);
    } catch (err) {
      setError(errorMessage(err));
    }
    setBusy(null);
  }

  if (signedIn === undefined) return <Loading />;

  const count = `${cart.itemCount} item${cart.itemCount === 1 ? "" : "s"}`;
  if (cart.lines.length === 0) {
    return (
      <>
        <PageTitle className="mb-7" count="0 items">
          Your bag
        </PageTitle>
        <EmptyState title="Your bag is empty." text="Saved items and the full catalogue are a click away.">
          <Link href={to("/products")} className="btn btn-primary">
            Start shopping
          </Link>
          <Link href={to(signedIn ? "/account/wishlist" : `/login?next=${to("/account/wishlist")}`)} className="btn btn-secondary">
            View saved items
          </Link>
        </EmptyState>
      </>
    );
  }

  const shipping = cart.subtotal >= FREE_SHIPPING_FROM ? 0 : SHIPPING_FEE;
  const saved = cart.lines.reduce((sum, line) => sum + (line.compareAtPrice && line.compareAtPrice > line.unitPrice ? (line.compareAtPrice - line.unitPrice) * line.quantity : 0), 0);
  const freePct = Math.min(100, Math.round((cart.subtotal / FREE_SHIPPING_FROM) * 100));

  return (
    <>
      <PageTitle className="mb-7" count={count}>
        Your bag
      </PageTitle>
      <div className="grid items-start gap-12 lg:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]">
        <div className="min-w-0">
          <div className="mb-2 border border-divider px-[18px] py-4">
            <p className="mb-2.5 text-sm">{shipping ? <>You’re {formatInr(FREE_SHIPPING_FROM - cart.subtotal)} away from free shipping.</> : <>You’ve unlocked free shipping.</>}</p>
            <div className="h-1 bg-divider">
              <div className="h-full bg-accent transition-[width] duration-700 ease-[var(--ease)]" style={{ width: `${freePct}%` }} />
            </div>
          </div>
          {cart.hasIssues ? <Notice tone="amber">Some items changed since you added them. Update or remove them to continue.</Notice> : null}
          <div className="mt-2">
            <FormError message={error} />
          </div>
          <ul>
            {cart.lines.map((line) => (
              <li key={line.sku} className={`grid grid-cols-[88px_minmax(0,1fr)] gap-5 border-b border-divider py-6 transition-opacity sm:grid-cols-[120px_minmax(0,1fr)_auto] ${busy === line.sku ? "opacity-50" : ""}`}>
                <Link href={to(`/products/${line.slug}`)} className="relative block aspect-[4/5] overflow-hidden bg-surface" aria-label={line.title}>
                  {line.image?.url ? <span role="img" aria-label={line.image.alt || line.title} className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url(${line.image.url})` }} /> : null}
                </Link>
                <div className="flex min-w-0 flex-col gap-1.5">
                  <span className="text-[11px] uppercase tracking-[0.12em] text-foreground/60">{line.brand}</span>
                  <Link href={to(`/products/${line.slug}`)} className="vk-link font-heading text-2xl leading-tight">
                    {line.title}
                  </Link>
                  <span className="text-[13px] text-foreground/75">
                    {Object.values(line.options).join(" · ")}
                    {Object.keys(line.options).length ? " · " : ""}
                    {formatInr(line.unitPrice)} each
                  </span>
                  {line.status === "unavailable" ? <span className="text-[13px] text-accent-700">No longer available</span> : null}
                  {line.status === "insufficient_stock" ? <span className="text-[13px] text-accent-700">Only {line.available} left</span> : null}
                  <div className="mt-2.5 flex flex-wrap items-center gap-4">
                    {line.status !== "unavailable" ? (
                      <div className="flex items-center border border-divider">
                        <button type="button" aria-label={`Decrease quantity of ${line.title}`} disabled={busy !== null || line.quantity <= 1} onClick={() => change(line.sku, line.quantity - 1)} className="size-10 text-lg disabled:opacity-35">
                          −
                        </button>
                        <span className="min-w-6 text-center tabular-nums" aria-live="polite">
                          {line.quantity}
                        </span>
                        <button type="button" aria-label={`Increase quantity of ${line.title}`} disabled={busy !== null || line.quantity >= Math.min(10, line.available)} onClick={() => change(line.sku, line.quantity + 1)} className="size-10 text-lg disabled:opacity-35">
                          +
                        </button>
                      </div>
                    ) : null}
                    {signedIn ? (
                      <button type="button" className="btn btn-ghost" disabled={busy !== null} onClick={() => saveForLater(line)}>
                        Save for later
                      </button>
                    ) : null}
                    <button type="button" className="btn btn-ghost" disabled={busy !== null} onClick={() => change(line.sku, 0)}>
                      Remove
                    </button>
                  </div>
                </div>
                <div className="col-start-2 flex flex-col gap-0.5 sm:col-start-auto sm:items-end">
                  <span className="text-lg font-semibold tabular-nums">{formatInr(line.lineTotal)}</span>
                  {line.compareAtPrice && line.compareAtPrice > line.unitPrice ? <span className="text-[13px] line-through opacity-50">{formatInr(line.compareAtPrice * line.quantity)}</span> : null}
                </div>
              </li>
            ))}
          </ul>
        </div>
        <aside className="flex flex-col gap-4 border border-divider p-6 lg:sticky lg:top-36">
          <h3 className="m-0 text-[26px]">Order summary</h3>
          <div className="flex flex-col gap-2.5 text-[15px]">
            <SummaryRow label={`Subtotal (${count})`} value={formatInr(cart.subtotal)} />
            <SummaryRow label="Shipping" value={shipping ? formatInr(shipping) : "Free"} />
          </div>
          <div className="flex items-baseline justify-between border-t border-divider pt-4">
            <span className="font-semibold">Total</span>
            <span className="font-heading text-[34px] tabular-nums">{formatInr(cart.subtotal + shipping)}</span>
          </div>
          {saved > 0 ? <span className="tag tag-accent self-start">You’re saving {formatInr(saved)}</span> : null}
          <Link href={to(signedIn ? "/checkout" : `/login?next=${to("/checkout")}`)} aria-disabled={cart.hasIssues} className={`btn btn-primary min-h-[52px] justify-between text-base ${cart.hasIssues ? "pointer-events-none opacity-45" : ""}`}>
            <span>{signedIn ? "Checkout" : "Sign in to check out"}</span>
            <span aria-hidden>→</span>
          </Link>
          <span className="flex items-center gap-2 text-xs opacity-65">
            <LockIcon />
            Secure checkout · UPI, cards, netbanking or cash on delivery
          </span>
          <p className="m-0 text-xs text-foreground/55">Prices include GST. Final prices and stock are confirmed at checkout.</p>
        </aside>
      </div>
    </>
  );
}

