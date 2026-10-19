import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ProductGrid } from "@/components/product-card";
import { SiteHeader } from "@/components/site-header";
import { getProduct, listProducts, type AttributeDef, type AttributeValue } from "@/lib/catalog";
import { Accordion, Gallery } from "@/components/product-gallery";
import { PurchasePanel } from "@/components/purchase-panel";

export async function productMetadata(slug: string): Promise<Metadata> {
  const product = await getProduct(slug).catch(() => null);
  if (!product) return { title: "Product not found" };
  return { title: product.title, description: product.description.slice(0, 160) || undefined, openGraph: product.images[0] ? { images: [product.images[0].url] } : undefined };
}

const formatValue = (def: AttributeDef, value: AttributeValue): string => {
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value)) return value.join(", ");
  return `${value}${def.unit ? ` ${def.unit}` : ""}`;
};

const muted = (pct: number) => `color-mix(in srgb,var(--color-text) ${pct}%,transparent)`;

export async function ProductPage({ slug }: { slug: string }) {
  const product = await getProduct(slug);
  if (!product) notFound();

  const specs = product.attributeDefs.filter((def) => !def.variantAxis && product.attributes[def.key] !== undefined);
  const discount = product.compareAtPrice && product.compareAtPrice > product.minPrice ? Math.round((1 - product.minPrice / product.compareAtPrice) * 100) : 0;
  const related = await listProducts(`category=${product.category.slug}&limit=5`).catch(() => null);
  const more = related?.items.filter((item) => item.id !== product.id).slice(0, 4) ?? [];

  const accordion = [
    ...(product.description ? [{ id: "details", title: "Details", body: product.description }] : []),
    ...(specs.length ? [{ id: "specs", title: "Specifications", rows: specs.map((def) => ({ k: def.label, v: formatValue(def, product.attributes[def.key] as AttributeValue) })) }] : []),
    { id: "ship", title: "Shipping & returns", body: "Free standard shipping over ₹499. Cash on Delivery available. Returns are accepted within 7 days — start one from your orders page. Prices include GST." },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
      <SiteHeader />
      <main style={{ maxWidth: 1400, margin: "0 auto", padding: "32px 32px 96px", width: "100%" }}>
        <div style={{ fontSize: 13, display: "flex", gap: 8, flexWrap: "wrap", color: muted(60), marginBottom: 24 }}>
          <Link href={"/"} style={{ color: "inherit" }}>
            Home
          </Link>
          {product.breadcrumbs.map((crumb) => (
            <span key={crumb.slug} style={{ display: "flex", gap: 8 }}>
              <span>/</span>
              <Link href={`/products?category=${crumb.slug}`} style={{ color: "inherit" }}>
                {crumb.name}
              </Link>
            </span>
          ))}
          <span>/</span>
          <span style={{ color: "var(--color-text)" }}>{product.title}</span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,440px),1fr))", gap: 56, alignItems: "start" }}>
          <Gallery images={product.images} title={product.title} discount={discount} />
          <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {product.brand ? (
                <Link href={`/products?brand=${encodeURIComponent(product.brand)}`} style={{ fontSize: 13, letterSpacing: ".12em", textTransform: "uppercase", textDecoration: "none" }}>
                  {product.brand} →
                </Link>
              ) : null}
              <h1 style={{ margin: 0, fontSize: "clamp(40px,4.6vw,68px)", lineHeight: 0.98 }}>{product.title}</h1>
            </div>
            <PurchasePanel product={product} />
            <Accordion items={accordion} />
          </div>
        </div>
        {more.length ? (
          <section data-reveal="" style={{ marginTop: 96 }}>
            <h2 style={{ margin: "0 0 28px", fontSize: "clamp(32px,3.4vw,48px)" }}>You may also like</h2>
            <ProductGrid products={more} min={240} />
          </section>
        ) : null}
      </main>
    </div>
  );
}
