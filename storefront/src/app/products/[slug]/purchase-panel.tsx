"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { FormError } from "@/components/form-field";
import { Price } from "@/components/product-card";
import { Button, Notice } from "@/components/ui";
import { errorMessage } from "@/lib/auth";
import { addToCart } from "@/lib/cart";
import type { ProductDetail } from "@/lib/catalog";
import { useSession } from "@/lib/session";
import { shopApi } from "@/lib/shop-api";

export function PurchasePanel({ product }: { product: ProductDetail }) {
  const axes = product.attributeDefs.filter((def) => def.variantAxis);
  // Preselect the first in-stock variant so the price shown is a real one.
  const initial = product.variants.find((variant) => variant.inStock) ?? product.variants[0];
  const [choice, setChoice] = useState<Record<string, string>>(initial?.options ?? {});
  const [quantity, setQuantity] = useState(1);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [added, setAdded] = useState(false);

  const variant = useMemo(() => product.variants.find((candidate) => axes.every((axis) => candidate.options[axis.key] === choice[axis.key])), [product.variants, axes, choice]);

  // Whether picking `value` for `axisKey` (keeping the other choices) leads to a variant that is in stock.
  const reachable = (axisKey: string, value: string) => product.variants.some((candidate) => candidate.inStock && candidate.options[axisKey] === value && axes.every((axis) => axis.key === axisKey || candidate.options[axis.key] === choice[axis.key]));

  function pick(axisKey: string, value: string) {
    const next = { ...choice, [axisKey]: value };
    // If that combination does not exist, jump to the closest variant that has the new value.
    if (!product.variants.some((candidate) => axes.every((axis) => candidate.options[axis.key] === next[axis.key]))) {
      const fallback = product.variants.find((candidate) => candidate.options[axisKey] === value && candidate.inStock) ?? product.variants.find((candidate) => candidate.options[axisKey] === value);
      if (fallback) return setChoice(fallback.options);
    }
    setChoice(next);
    setQuantity(1);
    setAdded(false);
  }

  async function add() {
    if (!variant) return;
    setPending(true);
    setError(null);
    try {
      await addToCart({ productId: product.id, sku: variant.sku, quantity, slug: product.slug, title: product.title, brand: product.brand, image: product.images[0] ?? null, options: variant.options, unitPrice: variant.price });
      setAdded(true);
    } catch (err) {
      setError(errorMessage(err));
    }
    setPending(false);
  }

  const maxQuantity = variant ? Math.max(1, variant.available) : 1;

  return (
    <div className="flex flex-col gap-5">
      <div className="text-2xl">
        <Price min={variant?.price ?? product.minPrice} compareAt={variant?.compareAtPrice ?? product.compareAtPrice} />
      </div>

      {axes.map((axis) => (
        <fieldset key={axis.key}>
          <legend className="mb-2 text-sm font-medium">
            {axis.label}: <span className="font-normal text-black/60 dark:text-white/60">{choice[axis.key] ?? "Choose"}</span>
          </legend>
          <div className="flex flex-wrap gap-2">
            {axis.options
              .filter((option) => product.variants.some((candidate) => candidate.options[axis.key] === option))
              .map((option) => {
                const selected = choice[axis.key] === option;
                const available = reachable(axis.key, option);
                return (
                  <button
                    key={option}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => pick(axis.key, option)}
                    className={`min-w-11 rounded-md border px-3 py-2 text-sm ${selected ? "border-foreground bg-foreground text-background" : "border-black/15 hover:border-black/40 dark:border-white/20"} ${available ? "" : "text-black/35 line-through dark:text-white/35"}`}
                  >
                    {option}
                  </button>
                );
              })}
          </div>
        </fieldset>
      ))}

      {variant && !variant.inStock ? <Notice tone="amber">This option is sold out.</Notice> : null}
      {variant && variant.inStock && variant.available <= 5 ? <p className="text-sm text-amber-700 dark:text-amber-400">Only {variant.available} left</p> : null}

      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm">
          Qty
          <select value={quantity} onChange={(event) => setQuantity(Number(event.target.value))} className="rounded-md border border-black/15 bg-background px-2 py-2 dark:border-white/20" disabled={!variant?.inStock}>
            {Array.from({ length: maxQuantity }, (_, i) => i + 1).map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </label>
        <Button variant="primary" className="flex-1 py-2.5" disabled={pending || !variant?.inStock} onClick={add}>
          {pending ? "Adding..." : variant?.inStock ? "Add to cart" : "Sold out"}
        </Button>
        <WishlistButton productId={product.id} />
      </div>
      {added ? (
        <Notice>
          Added to your cart.{" "}
          <Link href="/cart" className="font-medium underline">
            View cart
          </Link>
        </Notice>
      ) : null}
      <FormError message={error} />
    </div>
  );
}

function WishlistButton({ productId }: { productId: string }) {
  const user = useSession();
  const [saved, setSaved] = useState<boolean | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!user) return;
    let current = true;
    shopApi.wishlistIds().then(
      (ids) => current && setSaved(ids.includes(productId)),
      () => undefined,
    );
    return () => {
      current = false;
    };
  }, [user, productId]);

  if (user === null) {
    return (
      <Link href="/login?next=/account/wishlist" className="rounded-md border border-black/15 px-3 py-2.5 text-sm dark:border-white/20" title="Sign in to save items">
        ♡ Save
      </Link>
    );
  }

  async function toggle() {
    setPending(true);
    try {
      if (saved) await shopApi.removeFromWishlist(productId);
      else await shopApi.addToWishlist(productId);
      setSaved(!saved);
    } catch {
      // Leave the heart as it was; the next page load shows the real state.
    }
    setPending(false);
  }

  return (
    <Button onClick={toggle} disabled={pending || saved === null} aria-pressed={saved ?? false} className="py-2.5">
      {saved ? "♥ Saved" : "♡ Save"}
    </Button>
  );
}
