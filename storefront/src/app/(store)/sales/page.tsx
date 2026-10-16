import type { Metadata } from "next";
import { SalesPage } from "@/views/sales-page";

export const metadata: Metadata = { title: "Sale", description: "Everything on sale right now, and what is coming up." };

export default function Page() {
  return <SalesPage />;
}
