import type { Metadata } from "next";
import { CustomerDetailView } from "./customer-detail";

export const metadata: Metadata = { title: "Customer" };

export default async function CustomerPage({ params }: PageProps<"/customers/[id]">) {
  const { id } = await params;
  return <CustomerDetailView customerId={id} />;
}
