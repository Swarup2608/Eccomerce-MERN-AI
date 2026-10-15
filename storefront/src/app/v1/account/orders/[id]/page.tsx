import type { Metadata } from "next";
import { SiteHeaderV1 } from "@/components/v1/site-header";
import { SignedIn } from "@/components/signed-in";
import { PageShell } from "@/components/ui";
import { OrderView } from "@/app/(classic)/account/orders/[id]/order-view";

export const metadata: Metadata = { title: "Order details", robots: { index: false } };

export default async function OrderPage({ params }: PageProps<"/v1/account/orders/[id]">) {
  const { id } = await params;
  return (
    <div className="flex flex-1 flex-col">
      <SiteHeaderV1 />
      <PageShell width="max-w-[1080px]">
        <SignedIn next="/account/orders">
          <OrderView orderId={id} />
        </SignedIn>
      </PageShell>
    </div>
  );
}
