"use client";

import Link from "next/link";
import { useCart } from "@/lib/cart";

export function CartLink() {
  const { cart } = useCart();
  return (
    <Link href="/cart" className="relative no-underline hover:text-accent-700" aria-label={`Cart, ${cart.itemCount} item${cart.itemCount === 1 ? "" : "s"}`}>
      Cart
      {cart.itemCount > 0 ? <span className="ml-1 inline-flex min-w-5 items-center justify-center bg-accent px-1.5 text-xs font-semibold text-on-accent">{cart.itemCount}</span> : null}
    </Link>
  );
}
