import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ProductGrid } from "@/components/product-card";
import { SiteHeader } from "@/components/site-header";
import { getCategory, getCategoryTree, getFacets, getSale, listProducts, listQuery } from "@/lib/catalog";
import { formatDateTime } from "@/lib/money";
import { ActiveChips, Filters, SortSelect } from "@/components/shop-filters";

type SearchParams = Record<string, string | string[] | undefined>;

export async function shopMetadata(params: SearchParams): Promise<Metadata> {
  const category = typeof params.category === "string" ? await getCategory(params.category).catch(() => null) : null;
  const sale = typeof params.sale === "string" ? await getSale(params.sale) : null;
  return { title: category?.name ?? sale?.name ?? (typeof params.q === "string" ? `Search: ${params.q}` : params.onSale === "true" ? "On sale" : "Shop") };
}

const muted = (pct: number) => `color-mix(in srgb,var(--color-text) ${pct}%,transparent)`;

export async function ShopPage({ params }: { params: SearchParams }) {
  const query = listQuery({ ...params, limit: "24" });
  const facetQuery = listQuery({ ...params, page: undefined, sort: undefined });
  const categorySlug = typeof params.category === "string" ? params.category : undefined;
  const saleSlug = typeof params.sale === "string" ? params.sale : undefined;

  const [category, tree, products, facets, sale] = await Promise.all([categorySlug ? getCategory(categorySlug).catch(() => null) : null, getCategoryTree(), listProducts(query), getFacets(facetQuery), saleSlug ? getSale(saleSlug) : null]);
  if (categorySlug && !category) notFound();

  const q = typeof params.q === "string" ? params.q : "";
  const page = products?.page ?? 1;
  const totalPages = products?.totalPages ?? 0;
  const pageLink = (target: number) => {
    const search = new URLSearchParams(listQuery(params));
    search.set("page", String(target));
    return `/products?${search.toString()}`;
  };
  const title = q ? `Results for “${q}”` : (category?.name ?? (saleSlug ? (sale?.name ?? "Sale") : params.onSale === "true" ? "On sale" : "All products"));

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
      <SiteHeader />
      <main style={{ maxWidth: 1400, margin: "0 auto", padding: "32px 32px 96px", width: "100%" }}>
        <div style={{ fontSize: 13, display: "flex", gap: 8, flexWrap: "wrap", color: muted(60) }}>
          <Link href={"/"} style={{ color: "inherit" }}>
            Home
          </Link>
          <span>/</span>
          <Link href={`/products`} style={{ color: "inherit" }}>
            Shop
          </Link>
          {saleSlug || params.onSale === "true" ? (
            <span style={{ display: "flex", gap: 8 }}>
              <span>/</span>
              <Link href={`/sales`} style={{ color: "inherit" }}>
                Sale
              </Link>
            </span>
          ) : null}
          {category?.breadcrumbs.map((crumb) => (
            <span key={crumb.slug} style={{ display: "flex", gap: 8 }}>
              <span>/</span>
              <Link href={`/products?category=${crumb.slug}`} style={{ color: "inherit" }}>
                {crumb.name}
              </Link>
            </span>
          ))}
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 16, flexWrap: "wrap", margin: "16px 0 24px", paddingBottom: 20, borderBottom: "1px solid var(--color-divider)" }}>
          <h1 style={{ margin: 0, fontSize: "clamp(40px,5vw,72px)", lineHeight: 1 }}>
            {title} <span style={{ fontSize: ".4em", opacity: 0.5, fontFamily: "var(--font-body)", fontWeight: 400, letterSpacing: 0 }}>{products?.total ?? 0}</span>
          </h1>
          <SortSelect />
        </div>
        {saleSlug ? (
          <div role="status" style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", margin: "-4px 0 24px", padding: "12px 16px", borderLeft: "2px solid var(--color-accent)", background: "color-mix(in srgb,var(--color-accent) 10%,transparent)", fontSize: 14 }}>
            {sale?.status === "live" ? (
              <>
                <span className="tag tag-accent">{sale.label}</span>
                <span>{sale.description || "Discount applied automatically in your bag."}</span>
                <span style={{ color: muted(60) }}>Ends {formatDateTime(sale.endsAt)}</span>
              </>
            ) : sale?.status === "scheduled" ? (
              <span>This sale starts {formatDateTime(sale.startsAt)}.</span>
            ) : (
              <span>
                This sale has ended.{" "}
                <Link href={`/sales`} style={{ fontWeight: 600 }}>
                  See what’s on sale now →
                </Link>
              </span>
            )}
          </div>
        ) : null}
        <div style={{ display: "flex", gap: 40, alignItems: "flex-start", flexWrap: "wrap" }}>
          <Filters facets={facets} categories={tree} activeCategory={categorySlug} />
          <div style={{ flex: "999 1 480px", minWidth: 0, display: "flex", flexDirection: "column", gap: 24 }}>
            <ActiveChips />
            {products && products.items.length ? (
              <ProductGrid products={products.items} min={240} />
            ) : (
              <div style={{ padding: "64px 32px", border: "1px dashed var(--color-divider)", display: "flex", flexDirection: "column", gap: 12, alignItems: "flex-start" }}>
                <h3 style={{ margin: 0, fontSize: 30 }}>Nothing matches those filters.</h3>
                <p style={{ margin: 0, color: muted(62) }}>Try removing a filter or two — or start fresh.</p>
                <Link href={`/products`} className="btn btn-primary" style={{ minHeight: 44 }}>
                  Clear filters
                </Link>
              </div>
            )}
            {totalPages > 1 ? (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 16, fontSize: 14, marginTop: 24 }}>
                {page > 1 ? (
                  <Link href={pageLink(page - 1)} className="btn btn-secondary" style={{ minHeight: 42 }}>
                    ← Previous
                  </Link>
                ) : null}
                <span style={{ color: muted(55) }}>
                  Page {page} of {totalPages}
                </span>
                {page < totalPages ? (
                  <Link href={pageLink(page + 1)} className="btn btn-secondary" style={{ minHeight: 42 }}>
                    Next →
                  </Link>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      </main>
    </div>
  );
}
