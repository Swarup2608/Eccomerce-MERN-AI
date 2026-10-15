"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { FormError } from "@/components/form-field";
import { ProductCard } from "@/components/product-card";
import { ProductCardV3 } from "@/components/product-card-v3";
import { EmptyState, Loading } from "@/components/ui";
import { errorMessage } from "@/lib/auth";
import { shopApi, type WishlistEntry } from "@/lib/shop-api";
import { useBasePath, useHref } from "@/lib/base-path";

export function WishlistView() {
  const to = useHref();
  const base = useBasePath();
  const [items, setItems] = useState<WishlistEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let current = true;
    shopApi.wishlist().then(
      (loaded) => current && setItems(loaded),
      (err: unknown) => current && setError(errorMessage(err)),
    );
    return () => {
      current = false;
    };
  }, []);

  async function remove(productId: string) {
    try {
      await shopApi.removeFromWishlist(productId);
      setItems((current) => current?.filter((item) => item.product.id !== productId) ?? null);
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  if (!items) return error ? <FormError message={error} /> : <Loading />;
  if (items.length === 0) {
    return (
      <EmptyState title="Nothing saved yet." text="Tap the heart on any product to keep it here for later.">
        <Link href={to("/products")} className="btn btn-primary">
          Browse products
        </Link>
      </EmptyState>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <FormError message={error} />
      <div className="grid gap-x-5 gap-y-10 [grid-template-columns:repeat(auto-fill,minmax(230px,1fr))]">
        {items.map((item) => (
          <div key={item.product.id} className="flex flex-col gap-3">
            {item.available ? (
              base ? <ProductCardV3 product={item.product} base={base} /> : <ProductCard product={item.product} />
            ) : (
              <div className="flex flex-col gap-3.5 opacity-55">
                <div className="flex aspect-[4/5] items-center justify-center bg-surface text-xs uppercase tracking-[0.12em]">No longer available</div>
                <span className="font-heading text-[19px]">{item.product.title}</span>
              </div>
            )}
            <button type="button" onClick={() => remove(item.product.id)} className="btn btn-ghost self-start text-sm">
              Remove
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
