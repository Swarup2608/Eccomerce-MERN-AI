import type { Metadata } from "next";
import { SiteHeader } from "@/components/site-header";
import { PageShell } from "@/components/ui";
import { CheckoutView } from "./checkout-view";

export const metadata: Metadata = { title: "Checkout", robots: { index: false } };

export default function CheckoutPage() {
  return (
    <div className="flex flex-1 flex-col">
      <SiteHeader />
      <PageShell width="max-w-[1280px]">
        <h1 className="sr-only">Checkout</h1>
        <CheckoutView />
      </PageShell>
    </div>
  );
}
