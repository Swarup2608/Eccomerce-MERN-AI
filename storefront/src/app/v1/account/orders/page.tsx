import type { Metadata } from "next";
import { SiteHeaderV1 } from "@/components/v1/site-header";
import { AccountShell, SignedIn } from "@/components/signed-in";
import { PageShell } from "@/components/ui";
import { OrderList } from "@/app/(classic)/account/orders/order-list";

export const metadata: Metadata = { title: "Your orders", robots: { index: false } };

export default function OrdersPage() {
  return (
    <div className="flex flex-1 flex-col">
      <SiteHeaderV1 />
      <PageShell width="max-w-[1200px]">
        <SignedIn next="/account/orders">
          <AccountShell title="Orders" aside="Returns are free within 30 days of delivery.">
            <OrderList />
          </AccountShell>
        </SignedIn>
      </PageShell>
    </div>
  );
}
