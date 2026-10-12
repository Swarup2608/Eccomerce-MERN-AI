import type { Metadata } from "next";
import { SiteHeader } from "@/components/site-header";
import { PageShell } from "@/components/ui";
import { CartView } from "./cart-view";

export const metadata: Metadata = { title: "Your cart", robots: { index: false } };

export default function CartPage() {
  return (
    <div className="flex flex-1 flex-col">
      <SiteHeader />
      <PageShell width="max-w-4xl">
        <h1 className="mb-6 text-2xl font-semibold tracking-tight">Your cart</h1>
        <CartView />
      </PageShell>
    </div>
  );
}
