import type { Metadata } from "next";
import { SiteHeader } from "@/components/site-header";
import { AccountShell, SignedIn } from "@/components/signed-in";
import { PageShell } from "@/components/ui";
import { OrderList } from "@/app/(store)/account/orders/order-list";

export const metadata: Metadata = { title: "Your orders", robots: { index: false } };

export default function OrdersPage() {
  return (
    <div className="flex flex-1 flex-col">
      <SiteHeader />
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
