import Link from "next/link";
import { Logo } from "@/components/header-bar";
import { HeaderBar } from "@/components/header-bar";
import { getCategoryTree } from "@/lib/catalog";

export async function SiteHeader() {
  const categories = await getCategoryTree().catch(() => []);
  return <HeaderBar categories={categories} />;
}

const col = { display: "flex", flexDirection: "column", gap: 10, fontSize: 14 } as const;
const head = { fontSize: 12, letterSpacing: ".14em", textTransform: "uppercase", fontWeight: 600, marginBottom: 4 } as const;

export function SiteFooter() {
  return (
    <footer style={{ maxWidth: 1440, width: "100%", margin: "0 auto", padding: "0 24px 24px" }}>
      <div style={{ borderRadius: "var(--box-r,0px)", background: "var(--color-surface)", padding: "48px clamp(24px,4vw,48px) 24px", display: "flex", flexDirection: "column", gap: 40 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 40 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 12, gridColumn: "span 2" }}>
            <Logo size={28} />
            <p style={{ margin: 0, fontSize: 14, maxWidth: 340, color: "color-mix(in srgb,var(--color-text) 65%,transparent)" }}>Tools and objects from independent makers, shipped together.</p>
          </div>
          <div style={col}>
            <span style={head}>Shop</span>
            <Link className="vk-link" href="/products">All products</Link>
            <Link className="vk-link" href="/products?sort=newest">New arrivals</Link>
            <Link className="vk-link" href="/products?featured=true">Featured</Link>
            <Link className="vk-link" href="/sales">Sale</Link>
          </div>
          <div style={col}>
            <span style={head}>Help</span>
            <Link className="vk-link" href="/account/orders">Order status</Link>
            <Link className="vk-link" href="/account/orders">Returns</Link>
            <Link className="vk-link" href="/account/addresses">Addresses</Link>
          </div>
          <div style={col}>
            <span style={head}>Account</span>
            <Link className="vk-link" href="/account">Your account</Link>
            <Link className="vk-link" href="/account/wishlist">Saved items</Link>
            <Link className="vk-link" href="/login">Sign in</Link>
          </div>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap", paddingTop: 20, fontSize: 12, borderTop: "1px solid var(--color-divider)", color: "color-mix(in srgb,var(--color-text) 60%,transparent)" }}>
          <span>© {new Date().getFullYear()} Vektor Supply. All rights reserved.</span>
          <span>UPI · Cards · Netbanking · Cash on delivery</span>
        </div>
      </div>
    </footer>
  );
}
