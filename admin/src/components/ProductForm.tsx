"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import toast from "react-hot-toast";
import { FiStar, FiTrash2, FiUpload } from "react-icons/fi";
import AttributesEditor, { toRecord, toRows, type AttributeRow } from "@/components/AttributesEditor";
import { Card } from "@/components/ui";
import { listCategories, uploadProductImage, type Product, type ProductImage, type ProductInput, type ProductStatus } from "@/lib/api/admin";
import { errorMessage } from "@/lib/api/client";
import { slugify } from "@/lib/slugify";
import { useApi } from "@/lib/useApi";

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

// Shared create/edit form for catalog product details. `extra` renders below the
// details (the create page uses it for initial variants).
export default function ProductForm({ product, submitLabel, onSubmit, extra }: { product?: Product; submitLabel: string; onSubmit: (input: ProductInput) => Promise<void>; extra?: ReactNode }) {
  const { data: categories } = useApi("categories", async () => (await listCategories()).data.categories);
  const [name, setName] = useState(product?.name ?? "");
  const [slug, setSlug] = useState(product?.slug ?? "");
  const [slugEdited, setSlugEdited] = useState(Boolean(product));
  const [brand, setBrand] = useState(product?.brand ?? "");
  const [categoryId, setCategoryId] = useState(product ? (typeof product.categoryId === "string" ? product.categoryId : product.categoryId._id) : "");
  const [shortDescription, setShortDescription] = useState(product?.shortDescription ?? "");
  const [description, setDescription] = useState(product?.description ?? "");
  const [status, setStatus] = useState<ProductStatus>(product?.status ?? "draft");
  const [images, setImages] = useState<ProductImage[]>(product?.images ?? []);
  const [imageUrl, setImageUrl] = useState("");
  const [specs, setSpecs] = useState<AttributeRow[]>(toRows(product?.attributes));
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  function addImage(url: string) {
    setImages((current) => [...current, { url, isPrimary: current.length === 0, sortOrder: current.length, alt: name.trim() || undefined }]);
  }

  async function handleUpload(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith("image/") || file.size > MAX_IMAGE_BYTES) {
      toast.error("Choose an image up to 10 MB.");
      return;
    }
    setUploading(true);
    try {
      const url = await uploadProductImage(file);
      if (url) addImage(url);
      else toast("Uploads are not configured here. Paste an image URL instead.");
    } catch (err) {
      toast.error(errorMessage(err, "Image upload failed."));
    } finally {
      setUploading(false);
    }
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      await onSubmit({
        name: name.trim(),
        slug,
        brand: brand.trim() || undefined,
        categoryId,
        shortDescription: shortDescription.trim() || undefined,
        description: description.trim(),
        status,
        images: images.map((image, index) => ({ ...image, sortOrder: index })),
        attributes: toRecord(specs),
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="space-y-6" onSubmit={handleSubmit}>
      <Card>
        <h2 className="font-black">Details</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-semibold">
            Name
            <input
              className="field mt-1.5"
              value={name}
              maxLength={200}
              required
              onChange={(event) => {
                setName(event.target.value);
                if (!slugEdited) setSlug(slugify(event.target.value, 220));
              }}
            />
          </label>
          <label className="text-sm font-semibold">
            Slug
            <input
              className="field mt-1.5 font-mono"
              value={slug}
              required
              onChange={(event) => {
                setSlugEdited(true);
                setSlug(slugify(event.target.value, 220));
              }}
            />
          </label>
          <label className="text-sm font-semibold">
            Category
            <select className="field mt-1.5" value={categoryId} required onChange={(event) => setCategoryId(event.target.value)}>
              <option value="" disabled>
                Choose a category
              </option>
              {categories?.map((category) => (
                <option key={category._id} value={category._id}>
                  {category.name}
                  {category.isActive ? "" : " (hidden)"}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm font-semibold">
            Brand (optional)
            <input className="field mt-1.5" value={brand} maxLength={100} onChange={(event) => setBrand(event.target.value)} />
          </label>
          <label className="text-sm font-semibold sm:col-span-2">
            Short description (optional)
            <input className="field mt-1.5" value={shortDescription} maxLength={500} onChange={(event) => setShortDescription(event.target.value)} />
          </label>
          <label className="text-sm font-semibold sm:col-span-2">
            Description
            <textarea className="field mt-1.5 min-h-36" value={description} maxLength={10000} required onChange={(event) => setDescription(event.target.value)} />
          </label>
          <label className="text-sm font-semibold">
            Status
            <select className="field mt-1.5" value={status} onChange={(event) => setStatus(event.target.value as ProductStatus)}>
              <option value="draft">Draft (hidden)</option>
              <option value="active">Active (visible to shoppers and sellers)</option>
              <option value="archived">Archived</option>
            </select>
          </label>
        </div>
      </Card>

      <Card>
        <h2 className="font-black">Images</h2>
        <p className="mt-1 text-sm text-muted">The starred image is shown first on the storefront.</p>
        {images.length > 0 && (
          <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {images.map((image, index) => (
              <li key={`${image.url}-${index}`} className="relative overflow-hidden rounded-2xl border border-border">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={image.url} alt={image.alt ?? ""} className="aspect-square w-full object-cover" />
                <div className="absolute inset-x-2 top-2 flex justify-between">
                  <button
                    type="button"
                    aria-label="Make primary image"
                    className={`rounded-full p-1.5 shadow ${image.isPrimary ? "bg-amber-400 text-white" : "bg-white text-muted"}`}
                    onClick={() => setImages((current) => current.map((item, i) => ({ ...item, isPrimary: i === index })))}
                  >
                    <FiStar size={14} />
                  </button>
                  <button
                    type="button"
                    aria-label="Remove image"
                    className="rounded-full bg-white p-1.5 text-muted shadow hover:text-danger"
                    onClick={() =>
                      setImages((current) => {
                        const next = current.filter((_, i) => i !== index);
                        return next.length && !next.some((item) => item.isPrimary) ? next.map((item, i) => ({ ...item, isPrimary: i === 0 })) : next;
                      })
                    }
                  >
                    <FiTrash2 size={14} />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-4 flex flex-wrap gap-2">
          <label className="btn-secondary cursor-pointer">
            <FiUpload size={15} /> {uploading ? "Uploading…" : "Upload image"}
            <input type="file" accept="image/*" className="sr-only" disabled={uploading || images.length >= 20} onChange={(event) => handleUpload(event.target.files?.[0])} />
          </label>
          <input className="field min-w-60 flex-1" type="url" placeholder="…or paste an image URL" value={imageUrl} onChange={(event) => setImageUrl(event.target.value)} aria-label="Image URL" />
          <button
            type="button"
            className="btn-secondary"
            disabled={!/^https?:\/\//.test(imageUrl.trim()) || images.length >= 20}
            onClick={() => {
              addImage(imageUrl.trim());
              setImageUrl("");
            }}
          >
            Add URL
          </button>
        </div>
      </Card>

      <Card>
        <h2 className="font-black">Specifications</h2>
        <p className="mt-1 mb-4 text-sm text-muted">Shown on the product page, e.g. Material: Cotton.</p>
        <AttributesEditor label="Specification" rows={specs} onChange={setSpecs} keyPlaceholder="Name (e.g. Material)" valuePlaceholder="Value (e.g. Cotton)" />
      </Card>

      {extra}

      <button type="submit" className="btn-primary" disabled={saving || uploading || name.trim().length < 2 || slug.length < 2 || !categoryId || !description.trim()}>
        {saving ? "Saving…" : submitLabel}
      </button>
    </form>
  );
}
