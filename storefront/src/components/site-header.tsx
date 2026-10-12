import Link from "next/link";
import type { ReactNode } from "react";
import { AccountNav } from "@/components/account-nav";
import { CartLink } from "@/components/cart-link";

export function SiteHeader({ children }: { children?: ReactNode }) {
  return (
    <header className="border-b border-black/10 dark:border-white/10">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-4">
        <div className="flex items-center gap-6">
          <Link href="/" className="text-lg font-semibold tracking-tight">
            Storefront
          </Link>
          <Link href="/products" className="text-sm hover:underline">
            Shop
          </Link>
        </div>
        {/* A plain GET form: search works before any JavaScript has loaded. */}
        <form action="/products" role="search" className="order-last w-full sm:order-none sm:w-auto">
          <input type="search" name="q" placeholder="Search products" aria-label="Search products" maxLength={100} className="w-full rounded-md border border-black/15 bg-transparent px-3 py-1.5 text-sm outline-none focus:border-black/40 sm:w-64 dark:border-white/20" />
        </form>
        <nav className="flex items-center gap-4 text-sm">
          {children}
          <Link href="/account/wishlist" className="hover:underline">
            Wishlist
          </Link>
          <CartLink />
          <AccountNav />
        </nav>
      </div>
    </header>
  );
}
