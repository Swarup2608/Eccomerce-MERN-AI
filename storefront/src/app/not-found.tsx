import Link from "next/link";
import { SiteFooter, SiteHeader } from "@/components/site-header";

export default function NotFound() {
  return (
    <div className="flex flex-1 flex-col">
      <SiteHeader />
      <main className="mx-auto flex w-full max-w-[1080px] flex-1 flex-col items-start justify-center gap-5 px-6 py-24 sm:px-8">
        <span className="text-xs uppercase tracking-[0.14em] text-accent-700">Error 404</span>
        <h1 className="m-0 text-[clamp(48px,6.4vw,96px)] leading-[0.92] tracking-[-0.02em]">This page wandered off.</h1>
        <p className="m-0 max-w-[520px] text-[17px] text-foreground/65">The link may be old or mistyped. Everything we stock is still a click away.</p>
        <div className="flex flex-wrap gap-3">
          <Link href="/products" className="btn btn-primary min-h-[52px] min-w-[200px] justify-between text-base">
            <span>Shop all products</span>
            <span aria-hidden>→</span>
          </Link>
          <Link href="/" className="btn btn-secondary min-h-[52px] text-base">
            Home
          </Link>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
