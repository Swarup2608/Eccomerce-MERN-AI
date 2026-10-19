import type { Metadata } from "next";
import { Suspense } from "react";
import { Loading } from "@/components/ui";
import { SaleList } from "./sale-list";

export const metadata: Metadata = { title: "Sales" };

export default function SalesPage() {
  return (
    <Suspense fallback={<Loading />}>
      <SaleList />
    </Suspense>
  );
}
