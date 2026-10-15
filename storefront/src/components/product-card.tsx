import Link from "next/link";
import type { ProductCardData } from "@/lib/catalog";
import { formatInr } from "@/lib/money";
import { WishHeart } from "@/components/wish-heart";

const muted = (pct: number) => `color-mix(in srgb,var(--color-text) ${pct}%,transparent)`;

export function Price({ min, max, compareAt }: { min: number; max?: number; compareAt?: number | null }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
      <span style={{ fontSize: 16, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{max && max !== min ? `From ${formatInr(min)}` : formatInr(min)}</span>
      {compareAt && compareAt > min ? <span style={{ fontSize: 13, textDecoration: "line-through", color: muted(50) }}>{formatInr(compareAt)}</span> : null}
    </span>
  );
}

// Mirrors ProductCardV2: 4:5 image, discount/tag chips, wishlist heart, hover zoom and a bar at the bottom of the image.
export function ProductCard({ product }: { product: ProductCardData }) {
  const discount = product.compareAtPrice && product.compareAtPrice > product.minPrice ? Math.round((1 - product.minPrice / product.compareAtPrice) * 100) : 0;
  const href = `/products/${product.slug}`;
  return (
    <article className="vk-card" style={{ display: "flex", flexDirection: "column", gap: 14, minWidth: 0, height: "100%" }}>
      <div style={{ position: "relative" }}>
        <Link href={href} style={{ position: "relative", display: "block", aspectRatio: "4/5", overflow: "hidden", background: "var(--color-surface)", borderRadius: "var(--box-r,0px)" }} aria-label={product.title}>
          {product.image?.url ? (
            <span
              role="img"
              aria-label={product.image.alt || product.title}
              className="vk-card-img"
              style={{ display: "block", position: "absolute", inset: 0, width: "100%", height: "100%", background: `var(--color-surface) url(${product.image.url}) center/cover no-repeat` }}
            />
          ) : (
            <span style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, color: muted(40) }}>No image</span>
          )}
          <span style={{ position: "absolute", top: 12, left: 12, display: "flex", gap: 6, flexWrap: "wrap" }}>
            {discount > 0 ? (
              <span className="tag tag-accent" style={{ fontWeight: 600 }}>
                −{discount}%
              </span>
            ) : null}
            {!product.inStock ? (
              <span className="tag tag-neutral" style={{ background: "var(--color-bg)" }}>
                Sold out
              </span>
            ) : null}
          </span>
          <span className="vk-card-bar" style={{ position: "absolute", left: 12, right: 12, bottom: 12 }}>
            <span className="btn btn-primary" style={{ width: "100%", justifyContent: "space-between", minHeight: 44, background: "var(--color-text)", borderColor: "var(--color-text)", color: "var(--color-bg)" }}>
              <span>View product</span>
              <span>{formatInr(product.minPrice)}</span>
            </span>
          </span>
        </Link>
        <WishHeart productId={product.id} />
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "baseline" }}>
          <span style={{ fontSize: 12, letterSpacing: ".08em", textTransform: "uppercase", color: muted(60), whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{product.brand}</span>
        </div>
        <Link href={href} className="vk-card-name" style={{ fontFamily: "var(--font-heading)", fontWeight: "var(--font-heading-weight)", fontSize: 19, lineHeight: 1.2, color: "var(--color-text)", textDecoration: "none" }}>
          {product.title}
        </Link>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginTop: 2 }}>
          <Price min={product.minPrice} max={product.maxPrice} compareAt={product.compareAtPrice} />
        </div>
      </div>
    </article>
  );
}

export function ProductGrid({ products, min = 240 }: { products: ProductCardData[]; min?: number }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: `repeat(auto-fill,minmax(${min}px,1fr))`, gap: "40px 20px" }}>
      {products.map((product) => (
        <ProductCard key={product.id} product={product} />
      ))}
    </div>
  );
}
