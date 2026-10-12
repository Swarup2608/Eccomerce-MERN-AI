import type { Metadata } from "next";
import { SiteHeader } from "@/components/site-header";
import { SignedIn } from "@/components/signed-in";
import { PageShell } from "@/components/ui";
import { OrderView } from "./order-view";

export const metadata: Metadata = { title: "Order details", robots: { index: false } };

export default async function OrderPage({ params }: PageProps<"/account/orders/[id]">) {
  const { id } = await params;
  return (
    <div className="flex flex-1 flex-col">
      <SiteHeader />
      <PageShell width="max-w-4xl">
        <SignedIn next="/account/orders">
          <OrderView orderId={id} />
        </SignedIn>
      </PageShell>
    </div>
  );
}
