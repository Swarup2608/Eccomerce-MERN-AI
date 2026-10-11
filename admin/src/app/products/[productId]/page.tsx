"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import toast from "react-hot-toast";
import { FiArrowLeft, FiTrash2 } from "react-icons/fi";
import AdminShell, { PageSpinner } from "@/components/AdminShell";
import AttributesEditor, { toRecord, type AttributeRow } from "@/components/AttributesEditor";
import ProductForm from "@/components/ProductForm";
import { Badge, Card, ErrorState, PageHeader } from "@/components/ui";
import { createVariant, deleteVariant, getProduct, makeVariantDefault, updateProduct, type ProductVariant } from "@/lib/api/admin";
import { errorMessage } from "@/lib/api/client";
import { useApi } from "@/lib/useApi";

export default function EditProductPage() {
  return (
    <AdminShell>
      <EditProduct />
    </AdminShell>
  );
}

function EditProduct() {
  const { productId } = useParams<{ productId: string }>();
  const { data, error, loading, reload } = useApi(`product:${productId}`, async () => (await getProduct(productId)).data);

  if (loading && !data) return <PageSpinner label="Loading product…" />;
  if (error && !data) return <ErrorState message={error} onRetry={reload} />;
  if (!data) return null;

  return (
    <>
      <Link href="/products" className="mb-4 inline-flex items-center gap-1 text-sm font-semibold text-muted hover:text-primary">
        <FiArrowLeft size={14} /> Catalog products
      </Link>
      <PageHeader eyebrow="Catalog" title={data.product.name} actions={<Badge value={data.product.status} />} />

      <div className="grid gap-6 xl:grid-cols-[1.5fr_1fr]">
        <ProductForm
          key={data.product._id}
          product={data.product}
          submitLabel="Save changes"
          onSubmit={async (input) => {
            try {
              await updateProduct(productId, input);
              toast.success("Product saved");
              reload();
            } catch (err) {
              toast.error(errorMessage(err));
            }
          }}
        />
        <VariantsCard productId={productId} variants={data.variants} onChanged={reload} />
      </div>
    </>
  );
}

const describe = (variant: ProductVariant) =>
  Object.entries(variant.attributes)
    .map(([key, value]) => `${key}: ${value}`)
    .join(" · ");

function VariantsCard({ productId, variants, onChanged }: { productId: string; variants: ProductVariant[]; onChanged: () => void }) {
  const [rows, setRows] = useState<AttributeRow[]>([{ key: "", value: "" }]);
  const [busy, setBusy] = useState(false);

  async function run(action: () => Promise<unknown>, success: string) {
    setBusy(true);
    try {
      await action();
      toast.success(success);
      onChanged();
      return true;
    } catch (err) {
      toast.error(errorMessage(err));
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function handleAdd(event: FormEvent) {
    event.preventDefault();
    const attributes = toRecord(rows);
    if (Object.keys(attributes).length === 0) return;
    if (await run(() => createVariant(productId, attributes), "Variant added")) {
      setRows([{ key: "", value: "" }]);
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <h2 className="font-black">Variants</h2>
        <p className="mt-1 text-sm text-muted">Sellers attach their price and stock to a variant. Variants with seller offers can&apos;t be deleted.</p>
        <ul className="mt-4 divide-y divide-border">
          {variants.map((variant) => (
            <li key={variant._id} className="flex flex-wrap items-center gap-2 py-3 text-sm">
              <span className="min-w-0 flex-1 font-semibold">{describe(variant)}</span>
              {variant.isDefault ? (
                <span className="rounded-full bg-teal-50 px-2 py-0.5 text-xs font-bold text-primary">Default</span>
              ) : (
                <button type="button" className="text-xs font-semibold text-primary hover:underline" disabled={busy} onClick={() => run(() => makeVariantDefault(productId, variant._id), "Default variant updated")}>
                  Make default
                </button>
              )}
              <span className="text-xs text-muted">
                {variant.offerCount} offer{variant.offerCount === 1 ? "" : "s"}
              </span>
              <button
                type="button"
                aria-label={`Delete variant ${describe(variant)}`}
                className="rounded-lg p-1.5 text-muted hover:bg-red-50 hover:text-danger disabled:opacity-40"
                disabled={busy || variant.offerCount > 0 || variants.length === 1}
                onClick={() => {
                  if (window.confirm(`Delete variant "${describe(variant)}"?`)) void run(() => deleteVariant(productId, variant._id), "Variant deleted");
                }}
              >
                <FiTrash2 size={15} />
              </button>
            </li>
          ))}
        </ul>
      </Card>

      <Card>
        <h2 className="font-black">Add variant</h2>
        <form className="mt-4 space-y-4" onSubmit={handleAdd}>
          <AttributesEditor label="New variant option" rows={rows} onChange={setRows} maxRows={5} keyPlaceholder="Option (e.g. Size)" valuePlaceholder="Value (e.g. L)" />
          <button type="submit" className="btn-primary" disabled={busy || Object.keys(toRecord(rows)).length === 0}>
            Add variant
          </button>
        </form>
      </Card>
    </div>
  );
}
