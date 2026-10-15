import type { Metadata } from "next";
import { ShopPage, shopMetadata } from "@/views/shop-page";

export async function generateMetadata({ searchParams }: PageProps<"/products">): Promise<Metadata> {
  return shopMetadata(await searchParams);
}

export default async function ProductsPage({ searchParams }: PageProps<"/products">) {
  return <ShopPage params={await searchParams} />;
}
