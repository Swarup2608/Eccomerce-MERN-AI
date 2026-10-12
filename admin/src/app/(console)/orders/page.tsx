import type { Metadata } from "next";
import { Suspense } from "react";
import { Loading } from "@/components/ui";
import { OrderList } from "./order-list";

export const metadata: Metadata = { title: "Orders" };

export default function OrdersPage() {
  return (
    <Suspense fallback={<Loading />}>
      <OrderList />
    </Suspense>
  );
}
