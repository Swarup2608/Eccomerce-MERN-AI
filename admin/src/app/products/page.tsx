"use client";

import { useState } from "react";
import Link from "next/link";
import { FiPlus, FiSearch } from "react-icons/fi";
import AdminShell, { PageSpinner } from "@/components/AdminShell";
import { Badge, EmptyState, ErrorState, formatDate, PageHeader, Pagination } from "@/components/ui";
import { listCategories, listProducts } from "@/lib/api/admin";
import { useApi } from "@/lib/useApi";

export default function ProductsPage() {
  return (
    <AdminShell>
      <Products />
    </AdminShell>
  );
}

function Products() {
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [page, setPage] = useState(1);
  const { data: categories } = useApi("categories", async () => (await listCategories()).data.categories);
  const { data, error, loading, reload } = useApi(`products:${search}:${status}:${categoryId}:${page}`, async () => (await listProducts({ search, status, categoryId, page })).data);

  return (
    <>
      <PageHeader
        eyebrow="Catalog"
        title="Catalog products"
        description="The shared catalog. Sellers create offers with their own price and stock against these products."
        actions={
          <Link href="/products/new" className="btn-primary">
            <FiPlus size={16} /> New product
          </Link>
        }
      />

      <div className="mb-4 flex flex-wrap gap-3">
        <form
          className="relative min-w-60 flex-1"
          onSubmit={(event) => {
            event.preventDefault();
            setSearch(searchInput.trim());
            setPage(1);
          }}
        >
          <FiSearch className="absolute top-1/2 left-3 -translate-y-1/2 text-muted" size={16} />
          <input className="field pl-9" placeholder="Search name or slug" value={searchInput} onChange={(event) => setSearchInput(event.target.value)} aria-label="Search products" />
        </form>
        <select className="field w-auto" aria-label="Filter by status" value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}>
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="draft">Draft</option>
          <option value="archived">Archived</option>
        </select>
        <select className="field w-auto" aria-label="Filter by category" value={categoryId} onChange={(event) => { setCategoryId(event.target.value); setPage(1); }}>
          <option value="">All categories</option>
          {categories?.map((category) => (
            <option key={category._id} value={category._id}>
              {category.name}
            </option>
          ))}
        </select>
      </div>

      {loading && !data ? (
        <PageSpinner label="Loading products…" />
      ) : error && !data ? (
        <ErrorState message={error} onRetry={reload} />
      ) : !data || data.products.length === 0 ? (
        <EmptyState title="No products match" description="Create a product to add it to the catalog." />
      ) : (
        <>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Category</th>
                  <th>Variants</th>
                  <th>Status</th>
                  <th>Created</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {data.products.map((product) => {
                  const image = product.images.find((item) => item.isPrimary) ?? product.images[0];
                  return (
                    <tr key={product._id}>
                      <td>
                        <div className="flex items-center gap-3">
                          <span className="h-10 w-10 shrink-0 overflow-hidden rounded-xl bg-slate-100">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            {image && <img src={image.url} alt="" className="h-full w-full object-cover" />}
                          </span>
                          <span>
                            <span className="block font-semibold">{product.name}</span>
                            <span className="text-xs text-muted">{product.brand ?? product.slug}</span>
                          </span>
                        </div>
                      </td>
                      <td className="text-muted">{typeof product.categoryId === "string" ? "—" : product.categoryId?.name}</td>
                      <td className="tabular-nums">{product.variantCount ?? 0}</td>
                      <td>
                        <Badge value={product.status} />
                      </td>
                      <td className="whitespace-nowrap text-muted">{formatDate(product.createdAt)}</td>
                      <td className="text-right">
                        <Link href={`/products/${product._id}`} className="btn-secondary">
                          Edit
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <Pagination pagination={data.pagination} onPage={setPage} />
        </>
      )}
    </>
  );
}
