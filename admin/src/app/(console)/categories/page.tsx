import type { Metadata } from "next";
import { CategoriesManager } from "./categories-manager";

export const metadata: Metadata = { title: "Categories" };

export default function CategoriesPage() {
  return <CategoriesManager />;
}
