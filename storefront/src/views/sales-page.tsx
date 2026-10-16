import Link from "next/link";
import { ProductGrid } from "@/components/product-card";
import { SiteHeader } from "@/components/site-header";
import { getSales, listProducts, type PublicSale } from "@/lib/catalog";
import { formatDateTime } from "@/lib/money";

const PREVIEW_COUNT = 8;

const muted = (pct: number) => `color-mix(in srgb,var(--color-text) ${pct}%,transparent)`;

function scopeText(sale: PublicSale): string {
  if (sale.appliesTo === "all") return "Everything in the shop";
  if (sale.appliesTo === "categories" && sale.categories.length) return sale.categories.map((category) => category.name).join(", ");
  return "Selected products";
}

export async function SalesPage() {
  const { live, upcoming } = await getSales();
  const previews = await Promise.all(live.map((sale) => listProducts(`sale=${sale.slug}&limit=${PREVIEW_COUNT}`).catch(() => null)));

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
      <SiteHeader />
      <main style={{ maxWidth: 1400, margin: "0 auto", padding: "32px 32px 96px", width: "100%", display: "flex", flexDirection: "column", gap: 64 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 12, paddingBottom: 24, borderBottom: "1px solid var(--color-divider)" }}>
          <span style={{ fontSize: 12, letterSpacing: ".14em", textTransform: "uppercase", color: "var(--color-accent-700)" }}>Sale</span>
          <h1 style={{ margin: 0, fontSize: "clamp(48px,6vw,88px)", lineHeight: 0.95 }}>{live.length ? "On sale now." : "No sales right now."}</h1>
          <p style={{ margin: 0, maxWidth: 560, fontSize: 17, color: muted(70) }}>
            {live.length ? "Prices below already include the discount; it is applied automatically in your bag." : upcoming.length ? "The next one starts soon — see below." : "Check back soon, or browse the full shop."}
          </p>
          {!live.length ? (
            <Link href={`/products`} className="btn btn-primary" style={{ alignSelf: "flex-start", minHeight: 48, marginTop: 8 }}>
              Browse all products
            </Link>
          ) : null}
        </div>

        {live.map((sale, index) => {
          const items = previews[index]?.items ?? [];
          const total = previews[index]?.total ?? 0;
          return (
            <section key={sale.id} data-reveal="" style={{ display: "flex", flexDirection: "column", gap: 28 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 24, flexWrap: "wrap" }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 10, maxWidth: 720 }}>
                  <span className="tag tag-accent" style={{ alignSelf: "flex-start", fontWeight: 600 }}>
                    {sale.label}
                  </span>
                  <h2 style={{ margin: 0, fontSize: "clamp(34px,3.6vw,52px)", lineHeight: 1 }}>{sale.name}</h2>
                  {sale.description ? <p style={{ margin: 0, fontSize: 16, color: muted(70) }}>{sale.description}</p> : null}
                  <span style={{ fontSize: 13, color: muted(60) }}>
                    {scopeText(sale)} · Ends {formatDateTime(sale.endsAt)}
                  </span>
                </div>
                <Link href={`/products?sale=${sale.slug}`} className="btn btn-secondary" style={{ minHeight: 46, gap: 12 }}>
                  <span>Shop all{total ? ` ${total}` : ""}</span>
                  <span aria-hidden>→</span>
                </Link>
              </div>
              {items.length ? (
                <ProductGrid products={items} min={240} />
              ) : (
                <p style={{ margin: 0, color: muted(60) }}>Everything in this sale has sold out.</p>
              )}
            </section>
          );
        })}

        {upcoming.length ? (
          <section style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <h2 style={{ margin: 0, fontSize: "clamp(28px,3vw,40px)" }}>Coming up</h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(260px,1fr))", gap: 16 }}>
              {upcoming.map((sale) => (
                <div key={sale.id} style={{ border: "1px solid var(--color-divider)", borderRadius: "var(--box-r,0px)", padding: 20, display: "flex", flexDirection: "column", gap: 8 }}>
                  <span style={{ fontSize: 12, letterSpacing: ".12em", textTransform: "uppercase", color: "var(--color-accent-700)" }}>Starts {formatDateTime(sale.startsAt)}</span>
                  <span style={{ fontFamily: "var(--font-heading)", fontSize: 24, lineHeight: 1.1 }}>{sale.name}</span>
                  <span style={{ fontSize: 14, color: muted(70) }}>
                    {sale.label} · {scopeText(sale)}
                  </span>
                </div>
              ))}
            </div>
          </section>
        ) : null}
      </main>
    </div>
  );
}
