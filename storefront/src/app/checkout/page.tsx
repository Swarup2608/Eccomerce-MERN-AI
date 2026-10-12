import type { Metadata } from "next";
import { SiteHeader } from "@/components/site-header";
import { PageShell } from "@/components/ui";
import { CheckoutView } from "./checkout-view";

export const metadata: Metadata = { title: "Checkout", robots: { index: false } };

export default function CheckoutPage() {
  return (
    <div className="flex flex-1 flex-col">
      <SiteHeader />
      <PageShell width="max-w-5xl">
        <h1 className="mb-6 text-2xl font-semibold tracking-tight">Checkout</h1>
        <CheckoutView />
      </PageShell>
    </div>
  );
}
