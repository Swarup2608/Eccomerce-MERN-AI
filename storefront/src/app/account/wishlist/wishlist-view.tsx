"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { FormError } from "@/components/form-field";
import { ProductCard } from "@/components/product-card";
import { Loading, buttonClass } from "@/components/ui";
import { errorMessage } from "@/lib/auth";
import { shopApi, type WishlistEntry } from "@/lib/shop-api";

export function WishlistView() {
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
      <div className="flex flex-col items-center gap-4 py-16 text-center">
        <p className="text-black/60 dark:text-white/60">Nothing saved yet. Tap “Save” on any product to keep it here.</p>
        <Link href="/products" className={buttonClass("primary")}>
          Browse products
        </Link>
      </div>
    );
  }

  return (
    <>
      <FormError message={error} />
      <div className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 lg:grid-cols-4">
        {items.map((item) => (
          <div key={item.product.id} className="flex flex-col gap-2">
            {item.available ? <ProductCard product={item.product} /> : <div className="opacity-50"><p className="text-sm font-medium">{item.product.title}</p><p className="text-xs">No longer available</p></div>}
            <button type="button" onClick={() => remove(item.product.id)} className="self-start text-xs text-black/60 underline dark:text-white/60">
              Remove
            </button>
          </div>
        ))}
      </div>
    </>
  );
}
