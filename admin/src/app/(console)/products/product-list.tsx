"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useState, type FormEvent } from "react";
import { FormError } from "@/components/form-field";
import { Button, ButtonLink, Input, Loading, PageHeader, Pagination, Select, StatusPill, Table, Thumb } from "@/components/ui";
import { adminApi, flattenTree } from "@/lib/admin-api";
import { formatInr } from "@/lib/money";
import { useLoad } from "@/lib/use-load";

// Filters live in the URL so a filtered list can be bookmarked and the back button works.
export function ProductList() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const q = params.get("q") ?? "";
  const status = params.get("status") ?? "";
  const categoryId = params.get("categoryId") ?? "";
  const lowStock = params.get("lowStock") === "true";
  const page = Number(params.get("page") ?? "1") || 1;
  const [search, setSearch] = useState(q);

  const load = useCallback(() => adminApi.products({ q, status, categoryId, lowStock, page, limit: 25 }), [q, status, categoryId, lowStock, page]);
  const { data, error, loading } = useLoad(load);
  const loadCategories = useCallback(() => adminApi.categories(), []);
  const { data: categories } = useLoad(loadCategories);

  const navigate = (patch: Record<string, string | undefined>) => {
    const next = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries({ page: undefined, ...patch })) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    router.replace(`${pathname}${next.size ? `?${next.toString()}` : ""}`);
  };

  function onSearch(event: FormEvent) {
    event.preventDefault();
    navigate({ q: search.trim() || undefined });
  }

  return (
    <>
      <PageHeader title="Products" description="Everything in the catalogue, including drafts." actions={<ButtonLink href="/products/new" variant="primary">New product</ButtonLink>} />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <form onSubmit={onSearch} className="flex gap-2">
          <Input type="search" placeholder="Title, brand or SKU" value={search} onChange={(event) => setSearch(event.target.value)} className="w-56" />
          <Button type="submit">Search</Button>
        </form>
        <Select value={status} onChange={(event) => navigate({ status: event.target.value || undefined })} aria-label="Status">
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="draft">Draft</option>
          <option value="archived">Archived</option>
        </Select>
        <Select value={categoryId} onChange={(event) => navigate({ categoryId: event.target.value || undefined })} aria-label="Category">
          <option value="">All categories</option>
          {flattenTree(categories?.tree ?? []).map(({ category, depth }) => (
            <option key={category.id} value={category.id}>
              {"  ".repeat(depth)}
              {category.name}
            </option>
          ))}
        </Select>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={lowStock} onChange={(event) => navigate({ lowStock: event.target.checked ? "true" : undefined })} /> Low stock only
        </label>
      </div>
      <FormError message={error} />
      {!data ? (
        loading ? <Loading /> : null
      ) : (
        <>
          <Table
            empty={data.items.length === 0}
            head={
              <tr>
                <th className="px-3 py-2" colSpan={2}>Product</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2 text-right">Price</th>
                <th className="px-3 py-2 text-right">Stock</th>
                <th className="px-3 py-2 text-right">Variants</th>
              </tr>
            }
          >
            {data.items.map((product) => {
              const lowVariants = product.variants.filter((variant) => variant.isActive && variant.stock <= 5).length;
              return (
                <tr key={product.id} className={loading ? "opacity-60" : ""}>
                  <td className="w-12 px-3 py-2">
                    <Thumb src={product.images[0]?.url} alt={product.images[0]?.alt || product.title} />
                  </td>
                  <td className="px-3 py-2">
                    <Link href={`/products/${product.id}`} className="font-medium hover:underline">
                      {product.title}
                    </Link>
                    <p className="text-xs text-black/50 dark:text-white/50">{product.brand || "No brand"}{product.isFeatured ? " · Featured" : ""}</p>
                  </td>
                  <td className="px-3 py-2">
                    <StatusPill status={product.status} />
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{product.minPrice === product.maxPrice ? formatInr(product.minPrice) : `${formatInr(product.minPrice)} – ${formatInr(product.maxPrice)}`}</td>
                  <td className={`px-3 py-2 text-right tabular-nums ${product.totalStock === 0 ? "text-red-600" : ""}`}>
                    {product.totalStock}
                    {lowVariants ? <p className="text-xs text-amber-600">{lowVariants} low</p> : null}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{product.variants.length}</td>
                </tr>
              );
            })}
          </Table>
          <Pagination page={data.page} totalPages={data.totalPages} total={data.total} onPage={(next) => navigate({ page: String(next) })} />
        </>
      )}
    </>
  );
}
