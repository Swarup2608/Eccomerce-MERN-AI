import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ProductGrid } from "@/components/product-card";
import { SiteHeader } from "@/components/site-header";
import { PageShell } from "@/components/ui";
import { getCategory, getCategoryTree, getFacets, listProducts, listQuery } from "@/lib/catalog";
import { Filters, SortSelect } from "./filters";

export async function generateMetadata({ searchParams }: PageProps<"/products">): Promise<Metadata> {
  const params = await searchParams;
  const category = typeof params.category === "string" ? await getCategory(params.category).catch(() => null) : null;
  return { title: category?.name ?? (typeof params.q === "string" ? `Search: ${params.q}` : "Shop") };
}

export default async function ProductsPage({ searchParams }: PageProps<"/products">) {
  const params = await searchParams;
  const query = listQuery({ ...params, limit: "24" });
  const facetQuery = listQuery({ ...params, page: undefined, sort: undefined });
  const categorySlug = typeof params.category === "string" ? params.category : undefined;

  const [category, tree, products, facets] = await Promise.all([categorySlug ? getCategory(categorySlug).catch(() => null) : null, getCategoryTree(), listProducts(query), getFacets(facetQuery)]);
  if (categorySlug && !category) notFound();

  const q = typeof params.q === "string" ? params.q : "";
  const page = products?.page ?? 1;
  const totalPages = products?.totalPages ?? 0;
  const pageLink = (target: number) => {
    const search = new URLSearchParams(listQuery(params));
    search.set("page", String(target));
    return `/products?${search.toString()}`;
  };
  // Subcategories of the current category (or the top level) for quick drilling down.
  const findNode = (nodes: typeof tree): typeof tree => nodes.flatMap((node) => (node.slug === categorySlug ? [node] : findNode(node.children)));
  const children = categorySlug ? (findNode(tree)[0]?.children ?? []) : tree;

  return (
    <div className="flex flex-1 flex-col">
      <SiteHeader />
      <PageShell>
        <nav aria-label="Breadcrumb" className="mb-2 text-xs text-black/50 dark:text-white/50">
          <Link href="/products" className="hover:underline">
            Shop
          </Link>
          {category?.breadcrumbs.map((crumb) => (
            <span key={crumb.slug}>
              {" › "}
              <Link href={`/products?category=${crumb.slug}`} className="hover:underline">
                {crumb.name}
              </Link>
            </span>
          ))}
        </nav>
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{q ? `Results for “${q}”` : (category?.name ?? "All products")}</h1>
            <p className="mt-1 text-sm text-black/60 dark:text-white/60">
              {products?.total ?? 0} product{products?.total === 1 ? "" : "s"}
            </p>
          </div>
          <SortSelect />
        </div>
        {children.length ? (
          <div className="mb-6 flex flex-wrap gap-2">
            {children.map((child) => (
              <Link key={child.id} href={`/products?category=${child.slug}`} className="rounded-full border border-black/15 px-3 py-1 text-sm hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10">
                {child.name}
              </Link>
            ))}
          </div>
        ) : null}
        <div className="grid gap-8 md:grid-cols-[14rem_minmax(0,1fr)]">
          <Filters facets={facets} />
          <div>
            {products && products.items.length ? (
              <ProductGrid products={products.items} />
            ) : (
              <p className="rounded-lg border border-dashed border-black/15 px-6 py-16 text-center text-sm text-black/60 dark:border-white/20 dark:text-white/60">No products match these filters.</p>
            )}
            {totalPages > 1 ? (
              <div className="mt-10 flex items-center justify-center gap-4 text-sm">
                {page > 1 ? <Link href={pageLink(page - 1)} className="hover:underline">← Previous</Link> : null}
                <span className="text-black/50 dark:text-white/50">
                  Page {page} of {totalPages}
                </span>
                {page < totalPages ? <Link href={pageLink(page + 1)} className="hover:underline">Next →</Link> : null}
              </div>
            ) : null}
          </div>
        </div>
      </PageShell>
    </div>
  );
}
