import Link from "next/link";
import { ProductGrid } from "@/components/product-card";
import { SiteHeader } from "@/components/site-header";
import { StatusBadge } from "@/components/status-badge";
import { buttonClass } from "@/components/ui";
import { getBackendStatus } from "@/lib/api";
import { getCategoryTree, listProducts } from "@/lib/catalog";

export default async function HomePage() {
  const [status, categories, featured, latest] = await Promise.all([getBackendStatus(), getCategoryTree(), listProducts("featured=true&limit=8").catch(() => null), listProducts("sort=newest&limit=8").catch(() => null)]);

  return (
    <div className="flex flex-1 flex-col">
      <SiteHeader>
        <StatusBadge status={status} />
      </SiteHeader>

      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-16 px-6 py-16">
        <section className="flex flex-col gap-6">
          <p className="text-sm font-medium uppercase tracking-widest text-black/50 dark:text-white/50">New season</p>
          <h1 className="max-w-2xl text-4xl font-semibold tracking-tight sm:text-5xl">Everything you need, delivered fast.</h1>
          <p className="max-w-xl text-lg text-black/60 dark:text-white/60">Browse curated products, pay with UPI, cards or cash on delivery, and track every order in one place.</p>
          <div>
            <Link href="/products" className={buttonClass("primary")}>
              Shop all products
            </Link>
          </div>
        </section>

        {categories.length ? (
          <section>
            <h2 className="mb-4 text-xl font-semibold tracking-tight">Shop by category</h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {categories.map((category) => (
                <Link key={category.id} href={`/products?category=${category.slug}`} className="rounded-lg border border-black/10 p-5 hover:border-black/30 dark:border-white/10 dark:hover:border-white/30">
                  <p className="font-medium">{category.name}</p>
                  <p className="mt-1 line-clamp-2 text-xs text-black/60 dark:text-white/60">{category.children.map((child) => child.name).join(", ") || category.description}</p>
                </Link>
              ))}
            </div>
          </section>
        ) : null}

        {featured?.items.length ? (
          <section>
            <h2 className="mb-4 text-xl font-semibold tracking-tight">Featured</h2>
            <ProductGrid products={featured.items} />
          </section>
        ) : null}

        {latest?.items.length ? (
          <section>
            <div className="mb-4 flex items-baseline justify-between">
              <h2 className="text-xl font-semibold tracking-tight">New arrivals</h2>
              <Link href="/products?sort=newest" className="text-sm hover:underline">
                See all
              </Link>
            </div>
            <ProductGrid products={latest.items} />
          </section>
        ) : null}
      </main>

      <footer className="border-t border-black/10 py-6 text-center text-sm text-black/50 dark:border-white/10 dark:text-white/50">
        &copy; {new Date().getFullYear()} Storefront · Prices include GST · Free shipping over ₹499
      </footer>
    </div>
  );
}
