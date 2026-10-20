"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent, type FormEvent } from "react";
import { FormError } from "@/components/form-field";
import { Badge, Button, Card, Field, Input, Loading, Notice, PageHeader, Select, TextArea, Thumb } from "@/components/ui";
import { adminApi, flattenTree, uploadImage, type AttributeDef, type AttributeValue, type CategoryDetail, type Product, type ProductInput, type ProductStatus, type Variant } from "@/lib/admin-api";
import { ApiError } from "@/lib/api";
import { errorMessage } from "@/lib/auth";
import { formatInr, paiseToRupees, rupeesToPaise } from "@/lib/money";
import { useLoad } from "@/lib/use-load";
import { confirmDialog, promptDialog } from "@/components/dialog";

const ACCEPTED_IMAGES = "image/jpeg,image/png,image/webp,image/avif";
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_IMAGES = 10;

// Prices are edited as rupee strings and converted to paise on save.
interface VariantRow {
  sku: string;
  options: Record<string, string>;
  price: string;
  compareAtPrice: string;
  stock: string;
  isActive: boolean;
  // Saved SKUs: their stock is owned by orders and changed with "Adjust" instead.
  persisted: boolean;
}

// An image is either already stored (it has a key) or only picked in this browser: then `file` holds it and `url` is a
// local blob: preview. Local images are uploaded to R2 only when the product is saved.
interface ImageRow {
  id: string;
  key: string | null;
  url: string;
  alt: string;
  file?: File;
}

const comboKey = (options: Record<string, string>): string => JSON.stringify(Object.entries(options).sort(([a], [b]) => a.localeCompare(b)));

const toRow = (variant: Variant, persisted: boolean): VariantRow => ({ sku: variant.sku, options: variant.options, price: paiseToRupees(variant.price), compareAtPrice: paiseToRupees(variant.compareAtPrice), stock: String(variant.stock), isActive: variant.isActive, persisted });

function combinations(axes: { key: string; values: string[] }[]): Record<string, string>[] {
  return axes.reduce<Record<string, string>[]>((acc, axis) => acc.flatMap((combo) => axis.values.map((value) => ({ ...combo, [axis.key]: value }))), [{}]);
}

const skuPart = (value: string): string => value.toUpperCase().replace(/[^A-Z0-9]+/g, "").slice(0, 6);

export function ProductEditor({ productId }: { productId: string | null }) {
  const router = useRouter();
  const loadCategories = useCallback(() => adminApi.categories(), []);
  const { data: categories } = useLoad(loadCategories);
  const [product, setProduct] = useState<Product | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!productId) return;
    let current = true;
    adminApi.product(productId).then(
      (loaded) => current && setProduct(loaded),
      (err: unknown) => current && setLoadError(errorMessage(err)),
    );
    return () => {
      current = false;
    };
  }, [productId]);

  if (productId && !product) return loadError ? <FormError message={loadError} /> : <Loading />;
  if (!categories) return <Loading />;

  return (
    <EditorForm
      key={product?.updatedAt ?? "new"}
      product={product}
      categoryOptions={flattenTree(categories.tree)}
      onSaved={(saved, created) => {
        if (created) router.replace(`/products/${saved.id}?created=1`);
        else setProduct(saved);
      }}
      onDeleted={() => router.replace("/products")}
    />
  );
}

function EditorForm({ product, categoryOptions, onSaved, onDeleted }: { product: Product | null; categoryOptions: ReturnType<typeof flattenTree>; onSaved: (product: Product, created: boolean) => void; onDeleted: () => void }) {
  const [title, setTitle] = useState(product?.title ?? "");
  const [slug, setSlug] = useState(product?.slug ?? "");
  const [brand, setBrand] = useState(product?.brand ?? "");
  const [description, setDescription] = useState(product?.description ?? "");
  const [tags, setTags] = useState(product?.tags.join(", ") ?? "");
  const [status, setStatus] = useState<ProductStatus>(product?.status ?? "draft");
  const [isFeatured, setFeatured] = useState(product?.isFeatured ?? false);
  const [categoryId, setCategoryId] = useState(product?.categoryId ?? "");
  const [category, setCategory] = useState<CategoryDetail | null>(null);
  const [attributes, setAttributes] = useState<Record<string, AttributeValue>>(product?.attributes ?? {});
  const [variants, setVariants] = useState<VariantRow[]>(() => product?.variants.map((variant) => toRow(variant, true)) ?? []);
  const [images, setImages] = useState<ImageRow[]>(() => product?.images.map((image) => ({ ...image, id: image.key })) ?? []);
  // Progress while the picked images are uploaded during save, e.g. { done: 1, total: 3 }.
  const [uploading, setUploading] = useState<{ done: number; total: number } | null>(null);
  const pendingImages = images.filter((image) => !image.key).length;
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // This form only renders in the browser (after the data loads), so reading the URL here is safe.
  const [notice, setNotice] = useState<string | null>(() => (new URLSearchParams(window.location.search).get("created") ? "Product created." : null));
  // Which values of each variant axis are offered, used to generate the variant rows.
  const [axisValues, setAxisValues] = useState<Record<string, string[]>>(() => {
    const picked: Record<string, string[]> = {};
    for (const variant of product?.variants ?? []) for (const [key, value] of Object.entries(variant.options)) picked[key] = [...new Set([...(picked[key] ?? []), value])];
    return picked;
  });

  useEffect(() => {
    if (!categoryId) return;
    let current = true;
    adminApi.category(categoryId).then(
      (loaded) => {
        if (!current) return;
        setCategory(loaded);
        // A category without variant axes sells exactly one variant with no options.
        if (!loaded.effectiveAttributes.some((def) => def.variantAxis)) {
          setVariants((rows) => (rows.length ? rows.slice(0, 1).map((row) => ({ ...row, options: {} })) : [{ sku: "", options: {}, price: "", compareAtPrice: "", stock: "0", isActive: true, persisted: false }]));
        }
      },
      (err: unknown) => current && setError(errorMessage(err)),
    );
    return () => {
      current = false;
    };
  }, [categoryId]);

  const defs = useMemo(() => (category && category.id === categoryId ? category.effectiveAttributes : []), [category, categoryId]);
  const axes = defs.filter((def) => def.variantAxis);
  const plainDefs = defs.filter((def) => !def.variantAxis);

  function generateVariants() {
    const chosen = axes.map((axis) => ({ key: axis.key, values: axisValues[axis.key] ?? [] }));
    if (chosen.some((axis) => axis.values.length === 0)) {
      setError(`Pick at least one value for each of: ${axes.map((axis) => axis.label).join(", ")}`);
      return;
    }
    setError(null);
    const existing = new Map(variants.map((row) => [comboKey(row.options), row]));
    const basePrice = variants[0]?.price ?? "";
    const prefix = skuPart(title) || "SKU";
    setVariants(
      combinations(chosen).map((options) => existing.get(comboKey(options)) ?? { sku: [prefix, ...Object.values(options).map(skuPart)].join("-"), options, price: basePrice, compareAtPrice: "", stock: "0", isActive: true, persisted: false }),
    );
  }

  const updateVariant = (index: number, patch: Partial<VariantRow>) => setVariants((rows) => rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));

  // Blob previews hold the file in memory until revoked: free them when the editor goes away.
  const imagesRef = useRef(images);
  useEffect(() => {
    imagesRef.current = images;
  }, [images]);
  useEffect(() => () => imagesRef.current.forEach((image) => image.url.startsWith("blob:") && URL.revokeObjectURL(image.url)), []);

  // Picked images live only in this tab until saved, so warn before the page is closed or reloaded.
  useEffect(() => {
    if (pendingImages === 0) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [pendingImages]);

  // Only validates and previews the files; nothing is uploaded until the product is saved.
  function onFiles(files: FileList | null) {
    if (!files?.length) return;
    setError(null);
    if (images.length >= MAX_IMAGES) return setError(`A product can have at most ${MAX_IMAGES} images`);
    const list = [...files].slice(0, MAX_IMAGES - images.length);
    for (const file of list) {
      if (!ACCEPTED_IMAGES.split(",").includes(file.type)) return setError(`${file.name}: use a JPEG, PNG, WebP or AVIF image`);
      if (file.size > MAX_IMAGE_BYTES) return setError(`${file.name} is larger than 5 MB`);
    }
    setImages((current) => [...current, ...list.map((file) => ({ id: crypto.randomUUID(), key: null, url: URL.createObjectURL(file), alt: "", file }))]);
  }

  function removeImage(id: string) {
    setImages((current) => {
      const target = current.find((item) => item.id === id);
      if (target?.url.startsWith("blob:")) URL.revokeObjectURL(target.url);
      return current.filter((item) => item.id !== id);
    });
  }

  // Uploads the images that are still only in the browser and returns every image with its storage key. A file that
  // uploaded before a failed save keeps its key, so a retry does not upload it again.
  async function uploadPending(rows: ImageRow[]): Promise<{ key: string; alt: string }[]> {
    const pending = rows.filter((row) => !row.key && row.file);
    if (pending.length) setUploading({ done: 0, total: pending.length });
    const keys = new Map<string, string>();
    try {
      for (const row of pending) {
        if (!row.file) continue;
        try {
          const uploaded = await uploadImage(row.file);
          keys.set(row.id, uploaded.key);
        } catch (err) {
          throw new Error(`${row.file.name}: ${errorMessage(err)}`);
        }
        setUploading({ done: keys.size, total: pending.length });
      }
    } finally {
      if (keys.size) setImages((current) => current.map((item) => (keys.has(item.id) ? { ...item, key: keys.get(item.id) ?? null } : item)));
      setUploading(null);
    }
    return rows.map((row) => ({ key: row.key ?? keys.get(row.id) ?? "", alt: row.alt }));
  }

  const moveImage = (from: number, to: number) =>
    setImages((current) => {
      const next = [...current];
      const [item] = next.splice(from, 1);
      if (item) next.splice(Math.max(0, Math.min(next.length, to)), 0, item);
      return next;
    });

  // Drag and drop: files dragged in from the desktop are added like picked ones, and thumbnails dragged within the
  // card reorder the images. `dragIndex` is set only for a thumbnail drag, which tells the two apart.
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);
  const [filesOver, setFilesOver] = useState(false);

  function endImageDrag() {
    setDragIndex(null);
    setOverIndex(null);
  }

  function onZoneDragOver(event: DragEvent<HTMLDivElement>) {
    if (dragIndex !== null || !event.dataTransfer.types.includes("Files")) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = images.length < MAX_IMAGES ? "copy" : "none";
    setFilesOver(true);
  }

  function onZoneDragLeave(event: DragEvent<HTMLDivElement>) {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFilesOver(false);
  }

  function onZoneDrop(event: DragEvent<HTMLDivElement>) {
    if (dragIndex !== null) return;
    event.preventDefault();
    setFilesOver(false);
    onFiles(event.dataTransfer.files);
  }

  function onThumbDragOver(event: DragEvent<HTMLDivElement>, index: number) {
    if (dragIndex === null) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    setOverIndex(index);
  }

  function onThumbDrop(event: DragEvent<HTMLDivElement>, index: number) {
    if (dragIndex === null) return;
    event.preventDefault();
    if (dragIndex !== index) moveImage(dragIndex, index);
    endImageDrag();
  }

  async function adjustStock(row: VariantRow) {
    if (!product) return;
    const answer = await promptDialog({
      title: `Adjust stock · ${row.sku}`,
      message: `Currently ${row.stock} in stock. Use a negative number to remove stock.`,
      label: "Change by",
      defaultValue: "10",
      inputMode: "numeric",
      confirmLabel: "Update stock",
      validate: (value) => (/^-?\d+$/.test(value.trim()) && Number(value) !== 0 ? null : "Enter a whole number other than 0"),
    });
    if (answer === null) return;
    const delta = Number(answer.trim());
    try {
      const updated = await adminApi.adjustStock(product.id, row.sku, { delta });
      setVariants((rows) => rows.map((item) => (item.sku === row.sku ? { ...item, stock: String(updated.variants.find((variant) => variant.sku === row.sku)?.stock ?? item.stock) } : item)));
      setNotice(`Stock for ${row.sku} updated.`);
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  function buildInput(): Omit<ProductInput, "images"> | string {
    const built: Variant[] = [];
    for (const row of variants) {
      const price = rupeesToPaise(row.price);
      const compareAtPrice = row.compareAtPrice.trim() ? rupeesToPaise(row.compareAtPrice) : null;
      const stock = Number(row.stock);
      if (!row.sku.trim()) return "Every variant needs a SKU";
      if (price === null) return `Enter a valid price for ${row.sku}`;
      if (row.compareAtPrice.trim() && compareAtPrice === null) return `Enter a valid compare-at price for ${row.sku}`;
      if (!Number.isInteger(stock) || stock < 0) return `Enter a valid stock for ${row.sku}`;
      built.push({ sku: row.sku.trim().toUpperCase(), options: row.options, price, compareAtPrice, stock, isActive: row.isActive });
    }
    const cleanAttributes: Record<string, AttributeValue> = {};
    for (const def of plainDefs) {
      const value = attributes[def.key];
      if (value === undefined || value === "" || (Array.isArray(value) && value.length === 0)) continue;
      cleanAttributes[def.key] = value;
    }
    return {
      title: title.trim(),
      ...(slug.trim() ? { slug: slug.trim() } : {}),
      description,
      brand: brand.trim(),
      categoryId,
      attributes: cleanAttributes,
      variants: built,
      tags: tags.split(",").map((tag) => tag.trim()).filter(Boolean),
      status,
      isFeatured,
    };
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setNotice(null);
    const input = buildInput();
    if (typeof input === "string") return setError(input);
    if (input.variants.length === 0) return setError(axes.length ? "Generate the variants first" : "Add a variant");
    setPending(true);
    try {
      // The form is valid, so now the picked images go to R2, then the product is saved with their keys.
      const withImages: ProductInput = { ...input, images: await uploadPending(images) };
      const saved = product ? await adminApi.updateProduct(product.id, withImages) : await adminApi.createProduct(withImages);
      onSaved(saved, !product);
      if (product) setNotice("Product saved.");
    } catch (err) {
      setError(err instanceof Error && !(err instanceof ApiError) ? err.message : errorMessage(err));
    }
    setPending(false);
  }

  async function remove() {
    if (!product || !(await confirmDialog({ title: `Delete “${product.title}”?`, message: "Products with orders are archived instead.", confirmLabel: "Delete product", tone: "danger" }))) return;
    try {
      const result = await adminApi.deleteProduct(product.id);
      if (result.archived) {
        setStatus("archived");
        setNotice("This product has orders, so it was archived instead of deleted.");
      } else onDeleted();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-6">
      <PageHeader title={product ? product.title : "New product"} description={product ? `${formatInr(product.minPrice)}${product.maxPrice !== product.minPrice ? ` – ${formatInr(product.maxPrice)}` : ""} · ${product.totalStock} in stock` : "Pick a category first: it decides which attributes and variants the product has."} />
      {notice ? <Notice>{notice}</Notice> : null}

      <Card title="Basics">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Title" className="sm:col-span-2">
            <Input required minLength={2} maxLength={200} value={title} onChange={(event) => setTitle(event.target.value)} />
          </Field>
          <Field label="Category">
            <Select required value={categoryId} onChange={(event) => { setCategoryId(event.target.value); setCategory(null); }}>
              <option value="" disabled>
                Choose a category
              </option>
              {categoryOptions.map(({ category: option, depth }) => (
                <option key={option.id} value={option.id}>
                  {"  ".repeat(depth)}
                  {option.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Brand">
            <Input maxLength={60} value={brand} onChange={(event) => setBrand(event.target.value)} />
          </Field>
          <Field label="Slug" hint="Leave empty to generate it from the title.">
            <Input maxLength={120} pattern="[a-z0-9]+(-[a-z0-9]+)*" value={slug} onChange={(event) => setSlug(event.target.value)} />
          </Field>
          <Field label="Tags" hint="Comma separated; used by search.">
            <Input value={tags} onChange={(event) => setTags(event.target.value)} />
          </Field>
          <Field label="Description" className="sm:col-span-2">
            <TextArea rows={5} maxLength={10000} value={description} onChange={(event) => setDescription(event.target.value)} />
          </Field>
        </div>
      </Card>

      {categoryId && !category ? <Loading label="Loading category attributes..." /> : null}

      {plainDefs.length ? (
        <Card title="Attributes">
          <div className="grid gap-4 sm:grid-cols-2">
            {plainDefs.map((def) => (
              <AttributeInput key={def.key} def={def} value={attributes[def.key]} onChange={(value) => setAttributes((current) => ({ ...current, [def.key]: value as AttributeValue }))} />
            ))}
          </div>
        </Card>
      ) : null}

      {category ? (
        <Card title="Variants">
          {axes.length ? (
            <div className="mb-4 flex flex-col gap-3">
              {axes.map((axis) => (
                <div key={axis.key}>
                  <p className="mb-1.5 text-sm font-medium">{axis.label}</p>
                  <div className="flex flex-wrap gap-2">
                    {axis.options.map((option) => {
                      const on = axisValues[axis.key]?.includes(option) ?? false;
                      return (
                        <button
                          key={option}
                          type="button"
                          aria-pressed={on}
                          onClick={() => setAxisValues((current) => ({ ...current, [axis.key]: on ? (current[axis.key] ?? []).filter((value) => value !== option) : [...(current[axis.key] ?? []), option] }))}
                          className={`rounded-full border px-3 py-1 text-xs ${on ? "border-foreground bg-foreground text-background" : "border-black/15 dark:border-white/20"}`}
                        >
                          {option}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
              <div>
                <Button onClick={generateVariants}>Generate variants</Button>
                <span className="ml-3 text-xs text-black/50 dark:text-white/50">Existing variants keep their SKU, price and stock.</span>
              </div>
            </div>
          ) : null}
          {variants.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead className="text-left text-xs uppercase tracking-wide text-black/50 dark:text-white/50">
                  <tr>
                    {axes.length ? <th className="py-2 pr-2">Variant</th> : null}
                    <th className="py-2 pr-2">SKU</th>
                    <th className="py-2 pr-2">Price (₹)</th>
                    <th className="py-2 pr-2">Compare at (₹)</th>
                    <th className="py-2 pr-2">Stock</th>
                    <th className="py-2 pr-2">Active</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {variants.map((row, index) => (
                    <tr key={comboKey(row.options) + index} className="border-t border-black/5 dark:border-white/5">
                      {axes.length ? <td className="py-2 pr-2">{Object.values(row.options).join(" / ")}</td> : null}
                      <td className="py-2 pr-2">
                        <Input required className="w-40 font-mono uppercase" value={row.sku} disabled={row.persisted} onChange={(event) => updateVariant(index, { sku: event.target.value })} />
                      </td>
                      <td className="py-2 pr-2">
                        <Input required inputMode="decimal" className="w-28" value={row.price} onChange={(event) => updateVariant(index, { price: event.target.value })} placeholder="999.00" />
                      </td>
                      <td className="py-2 pr-2">
                        <Input inputMode="decimal" className="w-28" value={row.compareAtPrice} onChange={(event) => updateVariant(index, { compareAtPrice: event.target.value })} placeholder="Optional" />
                      </td>
                      <td className="py-2 pr-2">
                        {row.persisted ? (
                          <span className="flex items-center gap-2">
                            <span className={`tabular-nums ${Number(row.stock) <= 5 ? "text-amber-600" : ""}`}>{row.stock}</span>
                            <Button variant="ghost" className="px-2 py-1 text-xs" onClick={() => adjustStock(row)}>
                              Adjust
                            </Button>
                          </span>
                        ) : (
                          <Input required type="number" min={0} className="w-24" value={row.stock} onChange={(event) => updateVariant(index, { stock: event.target.value })} />
                        )}
                      </td>
                      <td className="py-2 pr-2">
                        <input type="checkbox" checked={row.isActive} onChange={(event) => updateVariant(index, { isActive: event.target.checked })} aria-label={`${row.sku} active`} />
                      </td>
                      <td className="py-2 text-right">
                        {axes.length ? (
                          <Button variant="ghost" className="px-2 py-1 text-xs text-red-600" onClick={() => setVariants((rows) => rows.filter((_, i) => i !== index))}>
                            Remove
                          </Button>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-black/50 dark:text-white/50">Pick the values above, then generate the variants.</p>
          )}
        </Card>
      ) : null}

      <Card title={`Images (${images.length}/${MAX_IMAGES})`} actions={pendingImages ? <span className="text-xs text-black/50 dark:text-white/50">{pendingImages} not uploaded yet · uploaded when you save</span> : null}>
        <div onDragOver={onZoneDragOver} onDragLeave={onZoneDragLeave} onDrop={onZoneDrop} className={`-m-2 flex flex-wrap gap-4 rounded-md p-2 outline-2 outline-dashed outline-offset-2 transition-colors ${filesOver ? "bg-black/3 outline-black/30 dark:bg-white/4 dark:outline-white/30" : "outline-transparent"}`}>
          {images.map((image, index) => (
            <div key={image.id} className={`flex w-36 flex-col gap-2 ${dragIndex === index ? "opacity-40" : ""}`}>
              <div
                draggable
                title="Drag to reorder"
                onDragStart={(event) => {
                  event.dataTransfer.effectAllowed = "move";
                  event.dataTransfer.setData("text/plain", image.id);
                  setDragIndex(index);
                }}
                onDragOver={(event) => onThumbDragOver(event, index)}
                onDrop={(event) => onThumbDrop(event, index)}
                onDragEnd={endImageDrag}
                className={`relative cursor-grab active:cursor-grabbing ${overIndex === index && dragIndex !== index ? "ring-2 ring-foreground ring-offset-2" : ""}`}
              >
                <Thumb src={image.url} alt={image.alt || title} size={144} />
                {!image.key ? <span className="absolute left-1 top-1"><Badge tone="amber">Not saved</Badge></span> : null}
              </div>
              <Input placeholder="Alt text" value={image.alt} maxLength={150} onChange={(event) => setImages((current) => current.map((item) => (item.id === image.id ? { ...item, alt: event.target.value } : item)))} />
              <div className="flex justify-between text-xs">
                <Button variant="ghost" className="px-1 py-0.5 text-xs" disabled={index === 0} onClick={() => moveImage(index, index - 1)} aria-label="Move left">
                  ←
                </Button>
                {index === 0 ? <Badge>Main</Badge> : null}
                <Button variant="ghost" className="px-1 py-0.5 text-xs text-red-600" onClick={() => removeImage(image.id)}>
                  Remove
                </Button>
                <Button variant="ghost" className="px-1 py-0.5 text-xs" disabled={index === images.length - 1} onClick={() => moveImage(index, index + 1)} aria-label="Move right">
                  →
                </Button>
              </div>
            </div>
          ))}
          {images.length < MAX_IMAGES ? (
            <label className="flex h-36 w-36 cursor-pointer flex-col items-center justify-center rounded-md border border-dashed border-black/20 text-center text-xs text-black/60 hover:bg-black/[0.03] dark:border-white/20 dark:text-white/60">
              {filesOver ? "Drop to add" : "Add or drop images"}
              <span className="mt-1 text-[10px]">JPEG, PNG, WebP, AVIF · 5 MB</span>
              <input type="file" accept={ACCEPTED_IMAGES} multiple className="sr-only" onChange={(event) => { onFiles(event.target.files); event.target.value = ""; }} />
            </label>
          ) : null}
        </div>
      </Card>

      <Card title="Publishing">
        <div className="flex flex-wrap items-end gap-6">
          <Field label="Status">
            <Select value={status} onChange={(event) => setStatus(event.target.value as ProductStatus)}>
              <option value="draft">Draft (hidden)</option>
              <option value="active">Active (in the shop)</option>
              <option value="archived">Archived (hidden)</option>
            </Select>
          </Field>
          <label className="flex items-center gap-2 pb-2 text-sm">
            <input type="checkbox" checked={isFeatured} onChange={(event) => setFeatured(event.target.checked)} /> Feature on the home page
          </label>
        </div>
      </Card>

      <FormError message={error} />
      <div className="flex flex-wrap justify-between gap-2">
        <Button type="submit" variant="primary" disabled={pending || !category}>
          {uploading ? `Uploading images ${uploading.done + 1} of ${uploading.total}...` : pending ? "Saving..." : product ? "Save product" : "Create product"}
        </Button>
        {product ? (
          <Button variant="danger" onClick={remove}>
            Delete
          </Button>
        ) : null}
      </div>
    </form>
  );
}

function AttributeInput({ def, value, onChange }: { def: AttributeDef; value: AttributeValue | undefined; onChange: (value: AttributeValue | undefined) => void }) {
  const label = `${def.label}${def.unit ? ` (${def.unit})` : ""}${def.required ? "" : " · optional"}`;
  switch (def.type) {
    case "text":
      return (
        <Field label={label}>
          <Input required={def.required} maxLength={300} value={typeof value === "string" ? value : ""} onChange={(event) => onChange(event.target.value || undefined)} />
        </Field>
      );
    case "number":
      return (
        <Field label={label}>
          <Input required={def.required} type="number" step="any" value={typeof value === "number" ? value : ""} onChange={(event) => onChange(event.target.value === "" ? undefined : Number(event.target.value))} />
        </Field>
      );
    case "boolean":
      return (
        <Field label={label}>
          <Select required={def.required} value={typeof value === "boolean" ? String(value) : ""} onChange={(event) => onChange(event.target.value === "" ? undefined : event.target.value === "true")}>
            <option value="">Not set</option>
            <option value="true">Yes</option>
            <option value="false">No</option>
          </Select>
        </Field>
      );
    case "select":
      return (
        <Field label={label}>
          <Select required={def.required} value={typeof value === "string" ? value : ""} onChange={(event) => onChange(event.target.value || undefined)}>
            <option value="">Not set</option>
            {def.options.map((option) => (
              <option key={option}>{option}</option>
            ))}
          </Select>
        </Field>
      );
    case "multiselect": {
      const selected = Array.isArray(value) ? value : [];
      return (
        <fieldset className="flex flex-col gap-1.5 text-sm">
          <legend className="mb-1.5 font-medium">{label}</legend>
          <div className="flex flex-wrap gap-3">
            {def.options.map((option) => (
              <label key={option} className="flex items-center gap-1.5">
                <input type="checkbox" checked={selected.includes(option)} onChange={(event) => onChange(event.target.checked ? [...selected, option] : selected.filter((item) => item !== option))} />
                {option}
              </label>
            ))}
          </div>
        </fieldset>
      );
    }
  }
}
