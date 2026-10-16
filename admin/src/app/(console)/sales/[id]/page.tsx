import type { Metadata } from "next";
import { SaleEditor } from "../sale-editor";

export const metadata: Metadata = { title: "Edit sale" };

export default async function EditSalePage({ params }: PageProps<"/sales/[id]">) {
  const { id } = await params;
  return <SaleEditor saleId={id} />;
}
