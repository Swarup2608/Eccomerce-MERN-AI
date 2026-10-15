import Link from "next/link";
import { HeaderBar, Logo } from "@/components/header-bar";
import { getCategoryTree } from "@/lib/catalog";

export async function SiteHeader() {
  const categories = await getCategoryTree().catch(() => []);
  return <HeaderBar categories={categories} />;
}

const footLink = { color: "inherit", textDecoration: "none" } as const;
const footHead = { fontSize: 12, letterSpacing: ".14em", textTransform: "uppercase", fontWeight: 600 } as const;
const col = { display: "flex", flexDirection: "column", gap: 10, fontSize: 14 } as const;

export function SiteFooter() {
  return (
    <footer style={{ borderTop: "1px solid var(--color-divider)" }}>
      <div style={{ maxWidth: 1400, margin: "0 auto", padding: "56px 32px 32px", display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 40 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 12, gridColumn: "span 2" }}>
          <Logo size={28} />
          <p style={{ margin: 0, fontSize: 14, maxWidth: 340, color: "color-mix(in srgb,var(--color-text) 65%,transparent)" }}>Tools and objects from independent makers, shipped together.</p>
        </div>
        <div style={col}>
          <span style={footHead}>Shop</span>
          <Link href="/products" style={footLink}>All products</Link>
          <Link href="/products?sort=newest" style={footLink}>New arrivals</Link>
          <Link href="/products?featured=true" style={footLink}>Featured</Link>
        </div>
        <div style={col}>
          <span style={footHead}>Help</span>
          <Link href="/account/orders" style={footLink}>Order status</Link>
          <Link href="/account/orders" style={footLink}>Returns</Link>
          <Link href="/account/addresses" style={footLink}>Addresses</Link>
        </div>
        <div style={col}>
          <span style={footHead}>Account</span>
          <Link href="/account" style={footLink}>Your account</Link>
          <Link href="/account/wishlist" style={footLink}>Saved items</Link>
          <Link href="/login" style={footLink}>Sign in</Link>
        </div>
      </div>
      <div style={{ maxWidth: 1400, margin: "0 auto", padding: "20px 32px 28px", display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap", fontSize: 12, borderTop: "1px solid var(--color-divider)", color: "color-mix(in srgb,var(--color-text) 60%,transparent)" }}>
        <span>© {new Date().getFullYear()} Vektor Supply. All rights reserved.</span>
        <span>UPI · Cards · Netbanking · Cash on delivery</span>
      </div>
    </footer>
  );
}
