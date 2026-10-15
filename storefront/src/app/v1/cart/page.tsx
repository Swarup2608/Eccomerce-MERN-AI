import type { Metadata } from "next";
import { SiteHeaderV1 } from "@/components/v1/site-header";
import { PageShell } from "@/components/ui";
import { CartView } from "@/app/(classic)/cart/cart-view";

export const metadata: Metadata = { title: "Your bag", robots: { index: false } };

export default function CartPage() {
  return (
    <div className="flex flex-1 flex-col">
      <SiteHeaderV1 />
      <PageShell width="max-w-[1400px]">
        <CartView />
      </PageShell>
    </div>
  );
}
