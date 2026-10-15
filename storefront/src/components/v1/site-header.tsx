import Link from "next/link";
import { Logo } from "@/components/header-bar";
import { HeaderBarV1 } from "@/components/v1/header-bar";
import { getCategoryTree } from "@/lib/catalog";

export async function SiteHeaderV1() {
  const categories = await getCategoryTree().catch(() => []);
  return <HeaderBarV1 categories={categories} />;
}

const col = { display: "flex", flexDirection: "column", gap: 10, fontSize: 14 } as const;
const head = { fontSize: 12, letterSpacing: ".14em", textTransform: "uppercase", fontWeight: 600, marginBottom: 4 } as const;

export function SiteFooterV1() {
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
            <Link className="vk-link" href="/v1/products">All products</Link>
            <Link className="vk-link" href="/v1/products?sort=newest">New arrivals</Link>
            <Link className="vk-link" href="/v1/products?featured=true">Featured</Link>
          </div>
          <div style={col}>
            <span style={head}>Help</span>
            <Link className="vk-link" href="/v1/account/orders">Order status</Link>
            <Link className="vk-link" href="/v1/account/orders">Returns</Link>
            <Link className="vk-link" href="/v1/account/addresses">Addresses</Link>
          </div>
          <div style={col}>
            <span style={head}>Account</span>
            <Link className="vk-link" href="/v1/account">Your account</Link>
            <Link className="vk-link" href="/v1/account/wishlist">Saved items</Link>
            <Link className="vk-link" href="/v1/login">Sign in</Link>
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
