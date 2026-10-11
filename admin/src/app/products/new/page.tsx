"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { FiArrowLeft, FiPlus, FiTrash2 } from "react-icons/fi";
import AdminShell from "@/components/AdminShell";
import AttributesEditor, { toRecord, type AttributeRow } from "@/components/AttributesEditor";
import ProductForm from "@/components/ProductForm";
import { Card, PageHeader } from "@/components/ui";
import { createProduct } from "@/lib/api/admin";
import { errorMessage } from "@/lib/api/client";

export default function NewProductPage() {
  const router = useRouter();
  const [variants, setVariants] = useState<AttributeRow[][]>([]);

  return (
    <AdminShell>
      <Link href="/products" className="mb-4 inline-flex items-center gap-1 text-sm font-semibold text-muted hover:text-primary">
        <FiArrowLeft size={14} /> Catalog products
      </Link>
      <PageHeader eyebrow="Catalog" title="New product" />
      <ProductForm
        submitLabel="Create product"
        onSubmit={async (input) => {
          const initialVariants = variants.map(toRecord).filter((attributes) => Object.keys(attributes).length > 0);
          try {
            const { data } = await createProduct({ ...input, ...(initialVariants.length ? { variants: initialVariants.map((attributes) => ({ attributes })) } : {}) });
            toast.success("Product created");
            router.push(`/products/${data.product._id}`);
          } catch (err) {
            toast.error(errorMessage(err));
          }
        }}
        extra={
          <Card>
            <h2 className="font-black">Variants</h2>
            <p className="mt-1 text-sm text-muted">Add one per sellable option, e.g. Size: M, Colour: Black. Leave empty for a single &quot;Standard&quot; variant. The first one is the default.</p>
            <div className="mt-4 space-y-4">
              {variants.map((rows, index) => (
                <div key={index} className="rounded-2xl border border-border p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <span className="text-sm font-bold">
                      Variant {index + 1}
                      {index === 0 && <span className="ml-2 text-xs font-semibold text-primary">default</span>}
                    </span>
                    <button type="button" aria-label={`Remove variant ${index + 1}`} className="text-muted hover:text-danger" onClick={() => setVariants((current) => current.filter((_, i) => i !== index))}>
                      <FiTrash2 size={15} />
                    </button>
                  </div>
                  <AttributesEditor label={`Variant ${index + 1} option`} rows={rows} maxRows={5} onChange={(next) => setVariants((current) => current.map((item, i) => (i === index ? next : item)))} keyPlaceholder="Option (e.g. Size)" valuePlaceholder="Value (e.g. M)" />
                </div>
              ))}
              <button type="button" className="btn-secondary" onClick={() => setVariants((current) => [...current, [{ key: "", value: "" }]])}>
                <FiPlus size={15} /> Add variant
              </button>
            </div>
          </Card>
        }
      />
    </AdminShell>
  );
}
