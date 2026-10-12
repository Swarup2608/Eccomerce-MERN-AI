import type { Metadata } from "next";
import { ProductEditor } from "../product-editor";

export const metadata: Metadata = { title: "New product" };

export default function NewProductPage() {
  return <ProductEditor productId={null} />;
}
