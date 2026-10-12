import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SiteHeader } from "@/components/site-header";
import { PageShell } from "@/components/ui";
import { getProduct, type AttributeDef, type AttributeValue } from "@/lib/catalog";
import { Gallery } from "./gallery";
import { PurchasePanel } from "./purchase-panel";

export async function generateMetadata({ params }: PageProps<"/products/[slug]">): Promise<Metadata> {
  const product = await getProduct((await params).slug).catch(() => null);
  if (!product) return { title: "Product not found" };
  return { title: product.title, description: product.description.slice(0, 160) || undefined, openGraph: product.images[0] ? { images: [product.images[0].url] } : undefined };
}

const formatValue = (def: AttributeDef, value: AttributeValue): string => {
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value)) return value.join(", ");
  return `${value}${def.unit ? ` ${def.unit}` : ""}`;
};

export default async function ProductPage({ params }: PageProps<"/products/[slug]">) {
  const product = await getProduct((await params).slug);
  if (!product) notFound();

  const specs = product.attributeDefs.filter((def) => !def.variantAxis && product.attributes[def.key] !== undefined);

  return (
    <div className="flex flex-1 flex-col">
      <SiteHeader />
      <PageShell>
        <nav aria-label="Breadcrumb" className="mb-6 text-xs text-black/50 dark:text-white/50">
          <Link href="/products" className="hover:underline">
            Shop
          </Link>
          {product.breadcrumbs.map((crumb) => (
            <span key={crumb.slug}>
              {" › "}
              <Link href={`/products?category=${crumb.slug}`} className="hover:underline">
                {crumb.name}
              </Link>
            </span>
          ))}
        </nav>
        <div className="grid gap-10 md:grid-cols-2">
          <Gallery images={product.images} title={product.title} />
          <div className="flex flex-col gap-6">
            <div>
              {product.brand ? (
                <Link href={`/products?brand=${encodeURIComponent(product.brand)}`} className="text-sm uppercase tracking-wide text-black/50 hover:underline dark:text-white/50">
                  {product.brand}
                </Link>
              ) : null}
              <h1 className="mt-1 text-3xl font-semibold tracking-tight">{product.title}</h1>
            </div>
            <PurchasePanel product={product} />
            {product.description ? <p className="whitespace-pre-line text-sm leading-relaxed text-black/70 dark:text-white/70">{product.description}</p> : null}
            {specs.length ? (
              <section>
                <h2 className="mb-2 font-semibold">Specifications</h2>
                <dl className="divide-y divide-black/10 rounded-lg border border-black/10 text-sm dark:divide-white/10 dark:border-white/10">
                  {specs.map((def) => (
                    <div key={def.key} className="flex justify-between gap-4 px-4 py-2.5">
                      <dt className="text-black/60 dark:text-white/60">{def.label}</dt>
                      <dd className="text-right">{formatValue(def, product.attributes[def.key] as AttributeValue)}</dd>
                    </div>
                  ))}
                </dl>
              </section>
            ) : null}
            <p className="text-xs text-black/50 dark:text-white/50">Prices include GST. Free shipping on orders over ₹499. Cash on Delivery available.</p>
          </div>
        </div>
      </PageShell>
    </div>
  );
}
