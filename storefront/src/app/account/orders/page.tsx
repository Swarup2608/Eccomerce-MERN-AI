import type { Metadata } from "next";
import { SiteHeader } from "@/components/site-header";
import { AccountShell, SignedIn } from "@/components/signed-in";
import { PageShell } from "@/components/ui";
import { OrderList } from "./order-list";

export const metadata: Metadata = { title: "Your orders", robots: { index: false } };

export default function OrdersPage() {
  return (
    <div className="flex flex-1 flex-col">
      <SiteHeader />
      <PageShell width="max-w-4xl">
        <SignedIn next="/account/orders">
          <AccountShell title="Your orders">
            <OrderList />
          </AccountShell>
        </SignedIn>
      </PageShell>
    </div>
  );
}
