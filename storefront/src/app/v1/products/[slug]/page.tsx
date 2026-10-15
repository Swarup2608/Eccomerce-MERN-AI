import type { Metadata } from "next";
import { ProductPage, productMetadata } from "@/views/product-page";

export async function generateMetadata({ params }: PageProps<"/v1/products/[slug]">): Promise<Metadata> {
  return productMetadata((await params).slug);
}

export default async function Page({ params }: PageProps<"/v1/products/[slug]">) {
  return <ProductPage slug={(await params).slug} v1 />;
}
