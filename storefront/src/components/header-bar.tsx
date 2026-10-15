"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, type CSSProperties } from "react";
import type { CategoryNode } from "@/lib/catalog";
import { useCart } from "@/lib/cart";

const muted = (pct: number) => `color-mix(in srgb,var(--color-text) ${pct}%,transparent)`;
const eyebrow: CSSProperties = { fontSize: 12, letterSpacing: ".14em", textTransform: "uppercase", color: "var(--color-accent-700)", marginBottom: 14 };
const navBtn: CSSProperties = { background: "none", border: 0, font: "inherit", fontSize: 15, fontWeight: 500, padding: "0 12px", cursor: "pointer", whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: 6, minHeight: 48, textDecoration: "none" };
const chevron = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="m6 9 6 6 6-6" />
  </svg>
);

export function Logo({ size = 24 }: { size?: number }) {
  return (
    <span style={{ display: "flex", alignItems: "center", gap: 10, fontFamily: "var(--font-heading)", fontWeight: "var(--font-heading-weight)", fontSize: size, letterSpacing: ".18em", color: "var(--color-text)" }}>
      <span style={{ width: size > 24 ? 16 : 14, height: size > 24 ? 16 : 14, border: "2px solid var(--color-accent)", transform: "rotate(45deg)" }} />
      VEKTOR
    </span>
  );
}

export function HeaderBar({ categories }: { categories: CategoryNode[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const { cart } = useCart();
  const [menu, setMenu] = useState(false);
  const [q, setQ] = useState("");
  const navColor = (active: boolean) => (active ? "var(--color-accent-700)" : "var(--color-text)");

  return (
    <header onMouseLeave={() => setMenu(false)} style={{ position: "sticky", top: 0, zIndex: 50, background: "var(--color-bg)", borderBottom: "1px solid var(--color-divider)" }}>
      <div style={{ borderBottom: "1px solid var(--color-divider)", fontSize: 12 }}>
        <div style={{ maxWidth: 1400, margin: "0 auto", padding: "7px 32px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
          <div style={{ display: "flex", gap: 20, flexWrap: "wrap", color: muted(70) }}>
            <span>Free shipping over ₹499</span>
            <span>7-day returns</span>
            <Link href="/products?featured=true" style={{ color: "var(--color-accent-700)", textDecoration: "none" }}>
              Featured picks
            </Link>
          </div>
          <div style={{ color: muted(60) }}>Prices include GST</div>
        </div>
      </div>
      <div style={{ maxWidth: 1400, margin: "0 auto", padding: "0 32px", display: "flex", alignItems: "center", gap: 20, minHeight: 76 }}>
        <Link href="/" onMouseEnter={() => setMenu(false)} style={{ textDecoration: "none" }} aria-label="Vektor home">
          <Logo />
        </Link>
        <nav style={{ display: "flex", alignItems: "stretch", alignSelf: "stretch", flex: "none" }}>
          <Link href="/products" onMouseEnter={() => setMenu(true)} style={{ ...navBtn, color: navColor(pathname.startsWith("/products")) }}>
            Shop{chevron}
          </Link>
          <Link href="/products?sort=newest" onMouseEnter={() => setMenu(false)} style={{ ...navBtn, color: "var(--color-text)" }}>
            New
          </Link>
          <Link href="/products?featured=true" onMouseEnter={() => setMenu(false)} style={{ ...navBtn, color: "var(--color-text)" }}>
            Featured<span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--color-accent)" }} />
          </Link>
          <Link href="/account/orders" onMouseEnter={() => setMenu(false)} style={{ ...navBtn, color: navColor(pathname.startsWith("/account/orders")) }}>
            Orders
          </Link>
        </nav>
        <div onMouseEnter={() => setMenu(false)} style={{ flex: "1 1 0", minWidth: 0, display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 6 }}>
          <form
            className="vk-search"
            role="search"
            onSubmit={(event) => {
              event.preventDefault();
              router.push(q.trim() ? `/products?q=${encodeURIComponent(q.trim())}` : "/products");
            }}
            style={{ position: "relative", flex: "1 1 200px", minWidth: 0, maxWidth: 320 }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", opacity: 0.6 }}>
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.5-3.5" />
            </svg>
            <input className="input" type="search" name="q" maxLength={100} aria-label="Search products" placeholder="Search products…" value={q} onChange={(event) => setQ(event.target.value)} style={{ paddingLeft: 36, minHeight: 42 }} />
          </form>
          <Link href="/products" className="btn btn-ghost btn-icon vk-search-btn" aria-label="Search" style={{ width: 44, height: 44 }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.5-3.5" />
            </svg>
          </Link>
          <Link href="/account" className="btn btn-ghost btn-icon" aria-label="Account" style={{ width: 44, height: 44 }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
              <circle cx="12" cy="8" r="4" />
              <path d="M4 21a8 8 0 0 1 16 0" />
            </svg>
          </Link>
          <Link href="/account/wishlist" className="btn btn-ghost btn-icon" aria-label="Saved items" style={{ width: 44, height: 44 }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
              <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
            </svg>
          </Link>
          <Link href="/cart" className="btn btn-primary" style={{ gap: 10, whiteSpace: "nowrap", flex: "none" }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
              <path d="M6 7h12l1 14H5L6 7Z" />
              <path d="M9 7a3 3 0 0 1 6 0" />
            </svg>
            <span>Bag · {cart.itemCount}</span>
          </Link>
        </div>
      </div>
      {menu && categories.length ? (
        <div style={{ position: "absolute", left: 0, right: 0, top: "100%", background: "var(--color-bg)", borderBottom: "1px solid var(--color-divider)", borderTop: "1px solid var(--color-divider)", boxShadow: "var(--shadow-lg)" }}>
          <div style={{ maxWidth: 1400, margin: "0 auto", padding: 32, display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 40 }}>
            <div>
              <div style={eyebrow}>Categories</div>
              {categories.map((category, index) => (
                <Link key={category.id} href={`/products?category=${category.slug}`} onClick={() => setMenu(false)} className="vk-link vk-mega-cat" style={{ display: "flex", alignItems: "baseline", gap: 12, padding: "7px 0", fontFamily: "var(--font-heading)", fontSize: 22, borderBottom: "1px solid var(--color-divider)" }}>
                  <span style={{ fontSize: 11, fontFamily: "var(--font-body)", opacity: 0.5 }}>{String(index + 1).padStart(2, "0")}</span>
                  <span style={{ flex: 1 }}>{category.name}</span>
                </Link>
              ))}
            </div>
            <div>
              <div style={eyebrow}>Collections</div>
              {[
                ["All products", "/products"],
                ["New arrivals", "/products?sort=newest"],
                ["Featured", "/products?featured=true"],
                ["Price: low to high", "/products?sort=price_asc"],
              ].map(([label = "", href = "/products"]) => (
                <Link key={href} href={href} onClick={() => setMenu(false)} className="vk-link" style={{ display: "block", padding: "8px 0", fontSize: 15 }}>
                  {label}
                </Link>
              ))}
            </div>
            <Link href="/products?featured=true" onClick={() => setMenu(false)} style={{ position: "relative", display: "flex", flexDirection: "column", justifyContent: "flex-end", minHeight: 300, padding: 14, textDecoration: "none", color: "var(--color-text)", background: "var(--color-surface)", overflow: "hidden" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="https://images.unsplash.com/photo-1490481651871-ab68de25d43d?auto=format&fit=crop&w=800&q=80" alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
              <span style={{ position: "relative", display: "flex", flexDirection: "column", gap: 6, padding: 16, background: "var(--color-bg)" }}>
                <span className="tag tag-accent" style={{ alignSelf: "flex-start" }}>Featured</span>
                <span style={{ fontFamily: "var(--font-heading)", fontSize: 34, lineHeight: 1 }}>Made to be kept</span>
                <span style={{ fontSize: 14 }}>Shop featured picks →</span>
              </span>
            </Link>
          </div>
        </div>
      ) : null}
    </header>
  );
}
