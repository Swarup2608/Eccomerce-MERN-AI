import Link from "next/link";
import type { CSSProperties } from "react";
import { ProductGrid } from "@/components/product-card";
import { SiteHeader } from "@/components/site-header";
import { getCategoryTree, listProducts, type ProductCardData } from "@/lib/catalog";
import { formatInr } from "@/lib/money";

const muted = (pct: number) => `color-mix(in srgb,var(--color-text) ${pct}%,transparent)`;
const U = (id: string, w = 1400) => `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=${w}&q=80`;
const MARQUEE = ["Free shipping over ₹499", "New drops every week", "7-day returns on everything", "Independent makers", "UPI, cards & cash on delivery", "Track every order"];

const sectionWrap: CSSProperties = { maxWidth: 1440, margin: "0 auto", padding: "112px 32px 0" };
const sectionHead: CSSProperties = { display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 16, marginBottom: 28, flexWrap: "wrap" };
const eyebrow: CSSProperties = { fontSize: 13, letterSpacing: ".12em", textTransform: "uppercase", color: "var(--color-accent-700)", marginBottom: 8 };
const h2: CSSProperties = { margin: 0, fontSize: "clamp(34px,3.6vw,52px)", lineHeight: 1 };
const bigRow: CSSProperties = { whiteSpace: "nowrap", fontFamily: "var(--font-heading)", fontWeight: "var(--font-heading-weight)", fontSize: "clamp(72px,11vw,184px)", lineHeight: 1, letterSpacing: "-.035em" };

const pct = (p: ProductCardData) => (p.compareAtPrice && p.compareAtPrice > p.minPrice ? Math.round((1 - p.minPrice / p.compareAtPrice) * 100) : 0);

export default async function HomePage() {
  const [categories, featured, latest] = await Promise.all([getCategoryTree().catch(() => []), listProducts("featured=true&limit=8").catch(() => null), listProducts("sort=newest&limit=24").catch(() => null)]);
  const tiles = await Promise.all(
    categories.slice(0, 6).map(async (category) => {
      const page = await listProducts(`category=${category.slug}&limit=1`).catch(() => null);
      return { category, image: page?.items[0]?.image?.url ?? null, count: page?.total ?? 0 };
    }),
  );
  const all = latest?.items ?? [];
  const heroPick = featured?.items[0] ?? all[0];
  const sale = all.filter((p) => pct(p) > 0).sort((a, b) => pct(b) - pct(a));
  const maxOff = sale[0] ? pct(sale[0]) : 0;
  const rowText = categories.length ? categories.map((c) => c.name).join(" · ") : "Audio · Watches · Footwear · Carry · Tech · Eyewear";

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
      <SiteHeader />
      <main>
        <section style={{ position: "relative", overflow: "hidden" }}>
          <div style={{ maxWidth: 1440, margin: "0 auto", padding: "0 32px", display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,480px),1fr))", gap: 48, minHeight: "calc(100vh - 116px)", alignItems: "center" }}>
            <div data-speed="-0.1" style={{ display: "flex", flexDirection: "column", gap: 28, padding: "56px 0", position: "relative", zIndex: 2 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13, letterSpacing: ".14em", textTransform: "uppercase" }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--color-accent)" }} />
                New drop — live now
              </div>
              <h1 style={{ fontSize: "clamp(56px,8.4vw,136px)", lineHeight: 0.88, letterSpacing: "-.04em", margin: 0, textWrap: "balance" }}>
                Made to
                <br />
                be kept.
              </h1>
              <p style={{ margin: 0, fontSize: 19, lineHeight: 1.5, maxWidth: 440, color: muted(70) }}>Curated products from independent makers. One bag, one checkout — pay with UPI, cards or cash on delivery.</p>
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                <Link href="/products" className="btn btn-primary" style={{ minHeight: 54, minWidth: 210, justifyContent: "space-between", fontSize: 16 }}>
                  <span>Shop the drop</span>
                  <span>→</span>
                </Link>
                <Link href="/products?featured=true" className="btn btn-secondary" style={{ minHeight: 54, fontSize: 16 }}>
                  Featured picks
                </Link>
              </div>
              <div style={{ display: "flex", gap: 28, flexWrap: "wrap", fontSize: 14, color: muted(65), paddingTop: 8 }}>
                <span>Free shipping over ₹499</span>
                <span>7-day returns</span>
                <span>Secure payments</span>
              </div>
            </div>
            <div style={{ position: "relative", height: "min(80vh,780px)", minHeight: 520 }}>
              <div style={{ position: "absolute", right: 0, top: "3%", width: "74%", height: "88%", overflow: "hidden", background: "var(--color-surface)" }}>
                <span role="img" aria-label="Featured collection" data-speed="0.14" style={{ display: "block", position: "absolute", left: 0, top: "-12%", width: "100%", height: "124%", background: `var(--color-surface) url(${U("1515886657613-9f3515b0c78f")}) center/cover no-repeat` }} />
              </div>
              {heroPick ? (
                <>
                  <Link href={`/products/${heroPick.slug}`} data-speed="-0.22" style={{ position: "absolute", left: 0, bottom: 0, width: "42%", aspectRatio: "4/5", overflow: "hidden", background: "var(--color-surface)", boxShadow: "var(--shadow-lg)", border: "6px solid var(--color-bg)" }}>
                    <span role="img" aria-label={heroPick.title} style={{ display: "block", width: "100%", height: "100%", background: `var(--color-surface) url(${heroPick.image?.url ?? ""}) center/cover no-repeat` }} />
                  </Link>
                  <Link href={`/products/${heroPick.slug}`} data-speed="-0.4" className="vk-link" style={{ position: "absolute", left: "26%", top: "8%", display: "flex", flexDirection: "column", gap: 2, padding: "14px 18px", minWidth: 210, background: "var(--color-bg)", boxShadow: "var(--shadow-md)" }}>
                    <span style={{ fontSize: 11, letterSpacing: ".14em", textTransform: "uppercase", color: "var(--color-accent-700)" }}>Featured</span>
                    <span style={{ fontFamily: "var(--font-heading)", fontSize: 22 }}>{heroPick.title}</span>
                    <span style={{ fontSize: 14 }}>
                      <b>{formatInr(heroPick.minPrice)}</b>
                      {heroPick.compareAtPrice && heroPick.compareAtPrice > heroPick.minPrice ? <span style={{ textDecoration: "line-through", opacity: 0.55 }}> {formatInr(heroPick.compareAtPrice)}</span> : null} · View →
                    </span>
                  </Link>
                </>
              ) : null}
            </div>
          </div>
        </section>

        <div aria-hidden style={{ overflow: "hidden", borderTop: "1px solid var(--color-divider)", borderBottom: "1px solid var(--color-divider)", padding: "14px 0", fontFamily: "var(--font-heading)", fontSize: 20 }}>
          <div className="vk-marquee" style={{ display: "flex", width: "max-content" }}>
            {["a", "b"].map((key) => (
              <div key={key} style={{ display: "flex", gap: 48, paddingRight: 48, flexShrink: 0 }}>
                {MARQUEE.map((text) => (
                  <span key={text} style={{ display: "inline-flex", alignItems: "center", gap: 48, whiteSpace: "nowrap" }}>
                    {text}
                    <span style={{ width: 6, height: 6, background: "var(--color-accent)", display: "inline-block", transform: "rotate(45deg)" }} />
                  </span>
                ))}
              </div>
            ))}
          </div>
        </div>

        <section aria-hidden style={{ overflow: "hidden", padding: "88px 0 40px", display: "flex", flexDirection: "column", gap: 4 }}>
          <div data-px="-0.5" style={bigRow}>{`${rowText} · ${rowText}`}</div>
          <div data-px="0.5" style={{ ...bigRow, color: "transparent", WebkitTextStroke: "1.5px var(--color-text)", marginLeft: "-60%" }}>
            One checkout · Independent makers · One checkout · Independent makers
          </div>
        </section>

        {tiles.length ? (
          <section data-reveal="" style={{ maxWidth: 1440, margin: "0 auto", padding: "40px 32px 0" }}>
            <div style={sectionHead}>
              <h2 style={h2}>Shop by category</h2>
              <Link href="/products" className="btn btn-secondary" style={{ minHeight: 42 }}>
                All products →
              </Link>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,300px),1fr))", gap: 16 }}>
              {tiles.map(({ category, image, count }) => (
                <Link key={category.id} href={`/products?category=${category.slug}`} style={{ position: "relative", display: "block", aspectRatio: "4/5", overflow: "hidden", background: "var(--color-surface)", textDecoration: "none" }}>
                  {image ? <span role="img" aria-label={category.name} data-speed="0.1" style={{ display: "block", position: "absolute", left: 0, top: "-10%", width: "100%", height: "120%", background: `var(--color-surface) url(${image}) center/cover no-repeat` }} /> : null}
                  <span style={{ position: "absolute", left: 14, right: 14, bottom: 14, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, padding: "14px 18px", background: "var(--color-bg)", color: "var(--color-text)" }}>
                    <span style={{ fontFamily: "var(--font-heading)", fontSize: 24 }}>{category.name}</span>
                    <span style={{ fontSize: 13, color: muted(65) }}>{count} items →</span>
                  </span>
                </Link>
              ))}
            </div>
          </section>
        ) : null}

        {sale.length ? (
          <>
            <section style={{ position: "relative", marginTop: 128, minHeight: "88vh", overflow: "hidden", display: "flex", alignItems: "flex-end" }}>
              <div style={{ position: "absolute", inset: 0, background: "var(--color-surface)" }}>
                <span role="img" aria-label="Sale" data-speed="0.3" style={{ display: "block", position: "absolute", left: 0, top: "-22%", width: "100%", height: "144%", background: `var(--color-surface) url(${U("1483985988355-763728e1935b", 2200)}) center/cover no-repeat` }} />
              </div>
              <div style={{ position: "relative", maxWidth: 1440, width: "100%", margin: "0 auto", padding: "48px 32px" }}>
                <div data-reveal="" style={{ maxWidth: 600, background: "var(--color-bg)", padding: "clamp(24px,4vw,48px)", display: "flex", flexDirection: "column", gap: 20, boxShadow: "var(--shadow-lg)" }}>
                  <span className="tag tag-accent" style={{ alignSelf: "flex-start" }}>On sale</span>
                  <h2 style={{ margin: 0, fontSize: "clamp(44px,5.6vw,84px)", lineHeight: 0.92, letterSpacing: "-.025em" }}>Up to {maxOff}% off. No codes.</h2>
                  <Link href="/products?sort=price_asc" className="btn btn-primary" style={{ alignSelf: "flex-start", minHeight: 54, minWidth: 210, justifyContent: "space-between", fontSize: 16 }}>
                    <span>Shop the sale</span>
                    <span>→</span>
                  </Link>
                </div>
              </div>
            </section>
            <section data-reveal="" style={sectionWrap}>
              <div style={sectionHead}>
                <div>
                  <div style={eyebrow}>Biggest markdowns first</div>
                  <h2 style={h2}>On sale now</h2>
                </div>
              </div>
              <ProductGrid products={sale.slice(0, 4)} />
            </section>
          </>
        ) : null}

        {featured?.items.length ? (
          <section data-reveal="" style={sectionWrap}>
            <div style={sectionHead}>
              <div>
                <div style={eyebrow}>Hand-picked</div>
                <h2 style={h2}>Featured</h2>
              </div>
              <Link href="/products?featured=true" className="btn btn-secondary" style={{ minHeight: 42 }}>
                See all →
              </Link>
            </div>
            <ProductGrid products={featured.items.slice(0, 8)} />
          </section>
        ) : null}

        {all.length ? (
          <section data-reveal="" style={{ ...sectionWrap, paddingBottom: 112 }}>
            <div style={sectionHead}>
              <div>
                <div style={eyebrow}>Just landed</div>
                <h2 style={h2}>New arrivals</h2>
              </div>
              <Link href="/products?sort=newest" className="btn btn-secondary" style={{ minHeight: 42 }}>
                See all →
              </Link>
            </div>
            <ProductGrid products={all.slice(0, 8)} />
          </section>
        ) : null}
      </main>
    </div>
  );
}
