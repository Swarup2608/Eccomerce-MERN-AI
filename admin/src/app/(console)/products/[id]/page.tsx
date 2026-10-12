import type { Metadata } from "next";
import { ProductEditor } from "../product-editor";

export const metadata: Metadata = { title: "Edit product" };

export default async function EditProductPage({ params }: PageProps<"/products/[id]">) {
  const { id } = await params;
  return <ProductEditor productId={id} />;
}
