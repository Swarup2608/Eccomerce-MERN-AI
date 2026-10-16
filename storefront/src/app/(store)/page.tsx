import Link from "next/link";
import type { CSSProperties } from "react";
import { ProductCard } from "@/components/product-card";
import { HeroSlider, HomeSearch, Rail, type HeroSlide } from "@/components/home-bits";
import { SiteHeader } from "@/components/site-header";
import { getCategoryTree, listProducts, type ProductCardData } from "@/lib/catalog";
import { formatInr } from "@/lib/money";

const U = (id: string, w = 1400) => `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=${w}&q=80`;
const muted = (pct: number) => `color-mix(in srgb,var(--color-text) ${pct}%,transparent)`;
const wrap = (top: number): CSSProperties => ({ maxWidth: 1440, margin: "0 auto", padding: `${top}px 24px 0`, width: "100%" });
const h2: CSSProperties = { margin: 0, fontSize: "clamp(36px,4vw,60px)", lineHeight: 1, letterSpacing: "-.03em" };
const pct = (p: ProductCardData) => (p.compareAtPrice && p.compareAtPrice > p.minPrice ? Math.round((1 - p.minPrice / p.compareAtPrice) * 100) : 0);

const SLIDES: HeroSlide[] = [
  { img: U("1515886657613-9f3515b0c78f", 2000), alt: "Model wearing the new collection", kicker: "New drop — live now", words: ["Gear", "up", "for", "every"], outline: "season.", sub: "Curated products from independent makers. One bag, one checkout — UPI, cards or cash on delivery.", cta: "Start shopping", href: "/products" },
  { img: U("1483985988355-763728e1935b", 2000), alt: "Featured picks", kicker: "Featured picks", words: ["Picked", "by", "people", "who"], outline: "care.", sub: "A short list of what we’d buy ourselves, refreshed with every drop.", cta: "See featured", href: "/products?featured=true" },
  { img: U("1469334031218-e382a71b716b", 2000), alt: "New arrivals", kicker: "Just landed", words: ["Made", "to", "be"], outline: "kept.", sub: "Built to last, priced fairly and shipped together from independent makers.", cta: "Shop new arrivals", href: "/products?sort=newest" },
];

const PERKS = [
  { t: "Free delivery", s: "On orders over ₹499", icon: "M3 7h11v9H3zM14 10h4l3 3v3h-7M7 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM17 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4z" },
  { t: "7-day returns", s: "Start one from your orders", icon: "M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5" },
  { t: "Secure payment", s: "UPI, cards or cash on delivery", icon: "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10zM9 12l2 2 4-4" },
  { t: "Track every order", s: "Live status from packing to doorstep", icon: "M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11zM12 12a2 2 0 1 0 0-4 2 2 0 0 0 0 4z" },
];

const FLOATERS = [
  ["1434389677669-e08b4cac3105", "4%", "12%", "150px", "-6deg", "-0.12"],
  ["1505740420928-5e560c06d30e", "82%", "8%", "130px", "5deg", "0.1"],
  ["1572635196237-14b3f281503f", "10%", "64%", "120px", "4deg", "0.18"],
  ["1542291026-7eec264c27ff", "78%", "60%", "160px", "-4deg", "-0.08"],
] as const;

const arrowUp = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M7 17 17 7M8 7h9v9" />
  </svg>
);

function PillCta({ href, label, light = false }: { href: string; label: string; light?: boolean }) {
  const fill = light ? { background: "#fff", color: "#141414" } : { background: "var(--color-text)", color: "var(--color-bg)" };
  return (
    <Link href={href} style={{ display: "inline-flex", alignItems: "center", gap: 6, textDecoration: "none" }}>
      <span style={{ display: "inline-flex", alignItems: "center", minHeight: 50, padding: "0 30px", borderRadius: 999, fontSize: 15, fontWeight: 600, ...fill }}>{label}</span>
      <span style={{ width: 50, height: 50, display: "grid", placeItems: "center", borderRadius: 999, border: "1px solid var(--color-text)", color: "var(--color-text)" }}>{arrowUp}</span>
    </Link>
  );
}

function MiniRow({ product }: { product: ProductCardData }) {
  return (
    <Link href={`/products/${product.slug}`} className="vk-link" style={{ display: "flex", alignItems: "center", gap: 14, padding: 8, margin: "0 -8px", borderRadius: "calc(var(--box-r,0px) * .6)" }}>
      <span role="img" aria-label={product.title} style={{ width: 72, height: 72, flex: "none", display: "block", borderRadius: "calc(var(--box-r,0px) * .5)", background: `var(--color-surface) url(${product.image?.url ?? ""}) center/cover` }} />
      <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
        <span style={{ fontSize: 15, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{product.title}</span>
        <span style={{ fontSize: 12, letterSpacing: ".06em", textTransform: "uppercase", color: "var(--color-accent-700)" }}>{product.brand}</span>
        <span style={{ fontSize: 14 }}>
          <b>{formatInr(product.minPrice)}</b>
          {pct(product) ? <span style={{ textDecoration: "line-through", opacity: 0.5 }}> {formatInr(product.compareAtPrice ?? 0)}</span> : null}
        </span>
      </span>
    </Link>
  );
}

export default async function Home({ searchParams }: PageProps<"/">) {
  const cat = (await searchParams).cat;
  const activeCat = typeof cat === "string" ? cat : "";
  const [categories, featured, latest, arrivals] = await Promise.all([
    getCategoryTree().catch(() => []),
    listProducts("featured=true&limit=8").catch(() => null),
    listProducts("sort=newest&limit=48").catch(() => null),
    listProducts(`sort=newest&limit=12${activeCat ? `&category=${encodeURIComponent(activeCat)}` : ""}`).catch(() => null),
  ]);
  const looks = await Promise.all(
    categories.slice(0, 4).map(async (category) => {
      const page = await listProducts(`category=${category.slug}&limit=1`).catch(() => null);
      return { category, image: page?.items[0]?.image?.url ?? null, count: page?.total ?? 0 };
    }),
  );

  const all = latest?.items ?? [];
  const deals = all.filter((p) => pct(p) > 0).sort((a, b) => pct(b) - pct(a));
  const deal = deals[0] ?? featured?.items[0] ?? all[0];
  const maxOff = deals[0] ? pct(deals[0]) : 0;
  const lists = [
    { title: "New arrivals", href: "/products?sort=newest", items: all.slice(0, 4) },
    { title: "Featured", href: "/products?featured=true", items: (featured?.items ?? []).slice(0, 4) },
    { title: deals.length ? "Biggest savings" : "Best value", href: deals.length ? "/products?sort=newest" : "/products?sort=price_asc", items: (deals.length ? deals : [...all].sort((a, b) => a.minPrice - b.minPrice)).slice(0, 4) },
  ].filter((list) => list.items.length);
  const marquee = ["Free shipping over ₹499", "New drops every week", "7-day returns on everything", "Independent makers", "UPI, cards & cash on delivery", "Track every order"];

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
      <SiteHeader />
      <main>
        <section style={wrap(16)}>
          <HeroSlider slides={SLIDES} secondary={{ label: "Browse all products", href: "/products" }} />
        </section>

        <div aria-hidden style={{ overflow: "hidden", padding: "18px 0", marginTop: 16, borderTop: "1px solid var(--color-divider)", borderBottom: "1px solid var(--color-divider)", fontFamily: "var(--font-heading)", fontSize: 18 }}>
          <div className="vk-marquee" style={{ display: "flex", width: "max-content" }}>
            {["a", "b"].map((row) => (
              <div key={row} style={{ display: "flex", gap: 48, paddingRight: 48, flexShrink: 0 }}>
                {marquee.map((text) => (
                  <span key={text} style={{ display: "inline-flex", alignItems: "center", gap: 48, whiteSpace: "nowrap" }}>
                    {text}
                    <span style={{ width: 6, height: 6, background: "var(--color-accent)", display: "inline-block", transform: "rotate(45deg)" }} />
                  </span>
                ))}
              </div>
            ))}
          </div>
        </div>

        <section data-reveal="" style={{ ...wrap(56), display: "flex", flexDirection: "column", gap: 24 }}>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <HomeSearch />
            <nav aria-label="Filter new arrivals by category" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <Link href="/" scroll={false} className="vk3-chip" aria-current={!activeCat}>
                All
              </Link>
              {categories.slice(0, 7).map((category) => (
                <Link key={category.id} href={`/?cat=${category.slug}`} scroll={false} className="vk3-chip" aria-current={activeCat === category.slug}>
                  {category.name}
                </Link>
              ))}
            </nav>
          </div>
          {arrivals?.items.length ? (
            <Rail
              title="New arrivals"
              action={
                <Link href={activeCat ? `/products?category=${activeCat}` : "/products?sort=newest"} className="btn btn-secondary">
                  View all
                </Link>
              }
            >
              {arrivals.items.map((product) => (
                <div key={product.id}>
                  <ProductCard product={product} />
                </div>
              ))}
            </Rail>
          ) : (
            <p style={{ margin: 0, color: muted(60) }}>Nothing here yet — try another category.</p>
          )}
        </section>

        <section style={wrap(56)}>
          <div data-stagger="" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(230px,1fr))", gap: 12 }}>
            {PERKS.map((perk) => (
              <div key={perk.t} style={{ display: "flex", alignItems: "center", gap: 14, padding: "18px 20px", borderRadius: "var(--box-r,0px)", background: "var(--color-surface)" }}>
                <span style={{ width: 48, height: 48, flex: "none", display: "grid", placeItems: "center", borderRadius: 999, background: "var(--color-bg)", color: "var(--color-accent-700)" }}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d={perk.icon} />
                  </svg>
                </span>
                <span style={{ display: "flex", flexDirection: "column" }}>
                  <b style={{ fontSize: 15, fontWeight: 600 }}>{perk.t}</b>
                  <span style={{ fontSize: 13, color: muted(62) }}>{perk.s}</span>
                </span>
              </div>
            ))}
          </div>
        </section>

        <section style={wrap(120)}>
          <h2 data-reveal="" style={{ ...h2, textAlign: "center", marginBottom: 40 }}>
            Offers for every kind of day
          </h2>
          <div data-reveal="" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,440px),1fr))", borderRadius: "var(--box-r,0px)", overflow: "hidden", background: "var(--color-surface)" }}>
            <div style={{ position: "relative", minHeight: 520, overflow: "hidden" }}>
              <span data-speed="0.14" role="img" aria-label="Featured lookbook" style={{ position: "absolute", left: 0, right: 0, top: "-12%", bottom: "-12%", display: "block", background: `var(--color-surface) url(${U("1490481651871-ab68de25d43d")}) center/cover no-repeat` }} />
            </div>
            <div style={{ display: "grid", placeItems: "center", padding: "clamp(24px,4vw,56px)", background: "var(--vk-accent-100)" }}>
              <div style={{ width: "100%", maxWidth: 460, display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", gap: 16, padding: "clamp(24px,3vw,40px)", borderRadius: "var(--box-r,0px)", background: "var(--color-bg)", boxShadow: "var(--shadow-md)" }}>
                <span style={{ padding: "5px 14px", borderRadius: 999, border: "1px solid var(--color-divider)", fontSize: 13, fontWeight: 500 }}>Offers</span>
                <h3 style={{ margin: 0, fontSize: "clamp(30px,3vw,42px)", lineHeight: 1.05, letterSpacing: "-.02em" }}>{maxOff ? `Up to ${maxOff}% off` : "Exclusive picks await"}</h3>
                <p style={{ margin: 0, fontSize: 15, lineHeight: 1.55, color: muted(65) }}>{deals.length ? `${deals.length} product${deals.length === 1 ? " is" : "s are"} already marked down — no codes needed.` : "Hand-picked products from independent makers, refreshed with every drop."}</p>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 8, width: "100%" }}>
                  {[
                    [String(latest?.total ?? all.length), "Products"],
                    [String(categories.length), "Categories"],
                    [maxOff ? `${maxOff}%` : "₹499", maxOff ? "Top saving" : "Free ship from"],
                  ].map(([value, label]) => (
                    <div key={label} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2, padding: "12px 6px", borderRadius: "calc(var(--box-r,0px) * .6)", background: "var(--color-surface)" }}>
                      <span style={{ fontSize: 26, fontWeight: 700, lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>{value}</span>
                      <span style={{ fontSize: 11, letterSpacing: ".1em", textTransform: "uppercase", opacity: 0.65 }}>{label}</span>
                    </div>
                  ))}
                </div>
                <PillCta href={deals.length ? `/products/${deals[0]?.slug}` : "/products?featured=true"} label={deals.length ? "Shop the deal" : "Try now"} />
              </div>
            </div>
          </div>
        </section>

        {deal ? (
          <section style={wrap(120)}>
            <div data-reveal="" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,420px),1fr))", gap: 32, alignItems: "center", padding: "clamp(20px,3vw,36px)", borderRadius: "var(--box-r,0px)", border: "1px solid var(--color-divider)" }}>
              <Link href={`/products/${deal.slug}`} aria-label={deal.title} style={{ position: "relative", display: "block", aspectRatio: "1/1", borderRadius: "calc(var(--box-r,0px) * .8)", overflow: "hidden", background: "var(--color-surface)" }}>
                <span role="img" aria-label={deal.title} className="vk3-zoom" style={{ position: "absolute", inset: 0, display: "block", background: `var(--color-surface) url(${deal.image?.url ?? ""}) center/cover` }} />
                {pct(deal) ? (
                  <span className="tag tag-accent" style={{ position: "absolute", left: 16, top: 16 }}>
                    −{pct(deal)}% off
                  </span>
                ) : null}
              </Link>
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <span style={{ fontSize: 13, letterSpacing: ".12em", textTransform: "uppercase", color: "var(--color-accent-700)" }}>{pct(deal) ? "Biggest markdown" : "Featured pick"}</span>
                <h2 style={{ margin: 0, fontSize: "clamp(34px,3.6vw,54px)", lineHeight: 1, letterSpacing: "-.03em" }}>{deal.title}</h2>
                <span style={{ fontSize: 14, color: muted(65) }}>
                  {deal.brand} · {deal.inStock ? "In stock" : "Out of stock"}
                </span>
                <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
                  <span style={{ fontSize: 36, fontWeight: 700, letterSpacing: "-.02em" }}>{formatInr(deal.minPrice)}</span>
                  {pct(deal) ? <span style={{ fontSize: 18, textDecoration: "line-through", opacity: 0.5 }}>{formatInr(deal.compareAtPrice ?? 0)}</span> : null}
                </div>
                {pct(deal) ? <p style={{ margin: 0, fontSize: 16, color: muted(72) }}>You save {formatInr((deal.compareAtPrice ?? 0) - deal.minPrice)} — already applied, no code needed.</p> : null}
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 6 }}>
                  <Link href={`/products/${deal.slug}`} className="btn btn-primary" style={{ minWidth: 200, justifyContent: "space-between" }}>
                    <span>Choose options</span>
                    <span>{formatInr(deal.minPrice)}</span>
                  </Link>
                  <Link href="/products" className="btn btn-secondary">
                    Keep browsing
                  </Link>
                </div>
              </div>
            </div>
          </section>
        ) : null}

        {lists.length ? (
          <section style={wrap(120)}>
            <div data-stagger="" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,300px),1fr))", gap: "40px 32px" }}>
              {lists.map((list) => (
                <div key={list.title} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", paddingBottom: 12, marginBottom: 6, borderBottom: "1px solid var(--color-divider)" }}>
                    <h3 style={{ margin: 0, fontSize: 24, letterSpacing: "-.01em" }}>{list.title}</h3>
                    <Link href={list.href} style={{ fontSize: 14 }}>
                      See all
                    </Link>
                  </div>
                  {list.items.map((product) => (
                    <MiniRow key={product.id} product={product} />
                  ))}
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {looks.length ? (
          <section style={wrap(140)}>
            <h2 data-reveal="" style={{ ...h2, textAlign: "center", maxWidth: 760, margin: "0 auto 48px", fontSize: "clamp(40px,5vw,76px)" }}>
              Fresh arrivals and new selections.
            </h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,280px),1fr))", gap: 16, alignItems: "start", paddingBottom: 60 }}>
              {looks.map(({ category, image, count }, i) => (
                <Link key={category.id} href={`/products?category=${category.slug}`} data-speed={[-0.05, 0.12, -0.08, 0.05][i]} style={{ position: "relative", display: "block", aspectRatio: "3/4", borderRadius: "var(--box-r,0px)", overflow: "hidden", background: "var(--color-surface)", color: "#fff", textDecoration: "none", marginTop: ["0px", "80px", "24px", "96px"][i] }}>
                  {image ? <span role="img" aria-label={category.name} className="vk3-zoom" style={{ position: "absolute", inset: 0, display: "block", background: `var(--color-surface) url(${image}) center/cover` }} /> : null}
                  <span aria-hidden style={{ position: "absolute", inset: 0, display: "block", background: "linear-gradient(0deg,rgba(12,12,12,.55),rgba(12,12,12,0) 45%)" }} />
                  <span style={{ position: "absolute", top: 14, right: 14, display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ padding: "9px 16px", borderRadius: 999, background: "var(--color-bg)", color: "var(--color-text)", fontSize: 13, fontWeight: 600 }}>Shop the edit</span>
                    <span style={{ width: 38, height: 38, display: "grid", placeItems: "center", borderRadius: 999, background: "var(--color-bg)", color: "var(--color-text)" }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
                        <path d="M12 5v14M5 12h14" />
                      </svg>
                    </span>
                  </span>
                  <span style={{ position: "absolute", left: 20, right: 20, bottom: 18, display: "flex", flexDirection: "column", gap: 2 }}>
                    <span style={{ fontSize: 26, fontWeight: 700, letterSpacing: "-.02em" }}>{category.name}</span>
                    <span style={{ fontSize: 14, opacity: 0.9 }}>
                      {count} product{count === 1 ? "" : "s"}
                    </span>
                  </span>
                </Link>
              ))}
            </div>
          </section>
        ) : null}

        <section style={{ ...wrap(100), paddingBottom: 96 }}>
          <div style={{ position: "relative", borderRadius: "var(--box-r,0px)", background: "var(--color-surface)", padding: "clamp(56px,8vw,120px) 24px", overflow: "hidden", display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", gap: 22 }}>
            {FLOATERS.map(([id, x, y, w, r, speed]) => (
              <span key={id} data-speed={speed} aria-hidden className="vk-hide-sm" style={{ position: "absolute", left: x, top: y, width: w, aspectRatio: "1/1", display: "block", borderRadius: "calc(var(--box-r,0px) * .7)", background: `var(--color-bg) url(${U(id, 400)}) center/cover`, boxShadow: "var(--shadow-md)", transform: `rotate(${r})` }} />
            ))}
            <h2 data-reveal="" style={{ position: "relative", margin: 0, fontSize: "clamp(56px,10vw,160px)", lineHeight: 0.9, letterSpacing: "-.05em" }}>
              Made to be kept
            </h2>
            <p style={{ position: "relative", margin: 0, fontSize: 17, maxWidth: 420, color: muted(68) }}>Create an account for saved bags across devices, a wishlist and live order tracking.</p>
            <div style={{ position: "relative", display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "center" }}>
              <Link href="/register" className="btn btn-primary" style={{ minHeight: 52, minWidth: 180 }}>
                Create account
              </Link>
              <Link href="/products" className="btn btn-secondary" style={{ minHeight: 52 }}>
                Shop all products
              </Link>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
