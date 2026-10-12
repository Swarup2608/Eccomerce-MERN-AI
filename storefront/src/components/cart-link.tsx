"use client";

import Link from "next/link";
import { useCart } from "@/lib/cart";

export function CartLink() {
  const { cart } = useCart();
  return (
    <Link href="/cart" className="relative hover:underline" aria-label={`Cart, ${cart.itemCount} item${cart.itemCount === 1 ? "" : "s"}`}>
      Cart
      {cart.itemCount > 0 ? <span className="ml-1 inline-flex min-w-5 items-center justify-center rounded-full bg-foreground px-1.5 text-xs font-semibold text-background">{cart.itemCount}</span> : null}
    </Link>
  );
}
