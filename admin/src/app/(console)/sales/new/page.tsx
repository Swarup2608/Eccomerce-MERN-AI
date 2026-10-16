import type { Metadata } from "next";
import { SaleEditor } from "../sale-editor";

export const metadata: Metadata = { title: "New sale" };

export default function NewSalePage() {
  return <SaleEditor saleId={null} />;
}
