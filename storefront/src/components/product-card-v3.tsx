import Link from "next/link";
import type { ProductCardData } from "@/lib/catalog";
import { formatInr } from "@/lib/money";
import { WishHeart } from "@/components/wish-heart";

const muted = (pct: number) => `color-mix(in srgb,var(--color-text) ${pct}%,transparent)`;

// Mirrors ProductCardV3: rounded 4:5 image that lifts on hover, name and price in a pill over the photo, and a round "+"
// that turns. Listing data has no SKU, so "+" opens the product to pick options rather than adding blindly.
export function ProductCardV3({ product, base = "/v1" }: { product: ProductCardData; base?: string }) {
  const discount = product.compareAtPrice && product.compareAtPrice > product.minPrice ? Math.round((1 - product.minPrice / product.compareAtPrice) * 100) : 0;
  const href = `${base}/products/${product.slug}`;
  const price = product.maxPrice !== product.minPrice ? `From ${formatInr(product.minPrice)}` : formatInr(product.minPrice);
  return (
    <article className="vk3-card" style={{ display: "flex", flexDirection: "column", gap: 10, minWidth: 0, height: "100%" }}>
      <div className="vk3-media" style={{ position: "relative", aspectRatio: "4/5", overflow: "hidden", borderRadius: "var(--box-r,0px)", background: "var(--color-surface)" }}>
        <Link href={href} aria-label={product.title} style={{ position: "absolute", inset: 0, display: "block" }}>
          {product.image?.url ? (
            <span role="img" aria-label={product.image.alt || product.title} className="vk3-img" style={{ position: "absolute", inset: 0, display: "block", background: `var(--color-surface) url(${product.image.url}) center/cover no-repeat` }} />
          ) : (
            <span style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", fontSize: 12, color: muted(40) }}>No image</span>
          )}
        </Link>
        <div style={{ position: "absolute", top: 12, left: 12, display: "flex", gap: 6, flexWrap: "wrap", pointerEvents: "none" }}>
          {discount > 0 ? <span className="tag tag-accent">−{discount}%</span> : null}
          {product.isFeatured ? <span className="tag tag-neutral">Featured</span> : null}
          {!product.inStock ? <span className="tag tag-neutral">Sold out</span> : null}
        </div>
        <WishHeart productId={product.id} />
        <div style={{ position: "absolute", left: 10, right: 10, bottom: 10, display: "flex", alignItems: "center", gap: 8, pointerEvents: "none" }}>
          <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 1, padding: "9px 16px", background: "var(--color-bg)", borderRadius: "var(--pill,0px)" }}>
            <span style={{ fontSize: 14, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{product.title}</span>
            <span style={{ display: "flex", gap: 8, alignItems: "baseline", fontSize: 13, fontVariantNumeric: "tabular-nums" }}>
              <b style={{ fontWeight: 600 }}>{price}</b>
              {discount > 0 && product.compareAtPrice ? <span style={{ textDecoration: "line-through", color: muted(50) }}>{formatInr(product.compareAtPrice)}</span> : null}
            </span>
          </div>
          <Link href={href} aria-label={`Choose options for ${product.title}`} className="vk3-plus" style={{ pointerEvents: "auto", width: 46, height: 46, flex: "none", display: "grid", placeItems: "center", borderRadius: 999, background: "var(--color-text)", color: "var(--color-bg)" }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
              <path d="M12 5v14M5 12h14" />
            </svg>
          </Link>
        </div>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, padding: "0 4px", fontSize: 12, color: muted(62) }}>
        <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{product.brand}</span>
        <span style={{ flex: "none" }}>{product.inStock ? "In stock" : "Out of stock"}</span>
      </div>
    </article>
  );
}

export function ProductGridV3({ products, min = 240, base = "/v1" }: { products: ProductCardData[]; min?: number; base?: string }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: `repeat(auto-fill,minmax(${min}px,1fr))`, gap: "36px 16px" }}>
      {products.map((product) => (
        <ProductCardV3 key={product.id} product={product} base={base} />
      ))}
    </div>
  );
}
