import type { Metadata } from "next";
import { Suspense } from "react";
import { Loading } from "@/components/ui";
import { ProductList } from "./product-list";

export const metadata: Metadata = { title: "Products" };

export default function ProductsPage() {
  return (
    <Suspense fallback={<Loading />}>
      <ProductList />
    </Suspense>
  );
}
