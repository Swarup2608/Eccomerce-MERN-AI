import type { Metadata } from "next";
import { SiteHeader } from "@/components/site-header";
import { PageShell } from "@/components/ui";
import { CartView } from "@/app/(store)/cart/cart-view";

export const metadata: Metadata = { title: "Your bag", robots: { index: false } };

export default function CartPage() {
  return (
    <div className="flex flex-1 flex-col">
      <SiteHeader />
      <PageShell width="max-w-[1400px]">
        <CartView />
      </PageShell>
    </div>
  );
}
