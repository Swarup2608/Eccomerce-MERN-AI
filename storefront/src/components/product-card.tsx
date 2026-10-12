import Link from "next/link";
import type { ProductCardData } from "@/lib/catalog";
import { formatInr } from "@/lib/money";
import { ProductPhoto } from "@/components/ui";

export function Price({ min, max, compareAt }: { min: number; max?: number; compareAt?: number | null }) {
  return (
    <span className="flex flex-wrap items-baseline gap-x-2">
      <span className="font-semibold tabular-nums">{max && max !== min ? `From ${formatInr(min)}` : formatInr(min)}</span>
      {compareAt && compareAt > min ? (
        <>
          <span className="text-sm text-black/40 line-through tabular-nums dark:text-white/40">{formatInr(compareAt)}</span>
          <span className="text-xs font-medium text-emerald-700 dark:text-emerald-400">{Math.round((1 - min / compareAt) * 100)}% off</span>
        </>
      ) : null}
    </span>
  );
}

export function ProductCard({ product }: { product: ProductCardData }) {
  return (
    <Link href={`/products/${product.slug}`} className="group flex flex-col gap-2">
      <div className="relative overflow-hidden rounded-lg">
        <ProductPhoto src={product.image?.url} alt={product.image?.alt || product.title} className="aspect-[4/5] w-full transition duration-300 group-hover:scale-[1.03]" />
        {!product.inStock ? <span className="absolute left-2 top-2 rounded bg-background/90 px-2 py-0.5 text-xs font-medium">Sold out</span> : null}
      </div>
      <div>
        {product.brand ? <p className="text-xs uppercase tracking-wide text-black/50 dark:text-white/50">{product.brand}</p> : null}
        <p className="line-clamp-2 text-sm font-medium group-hover:underline">{product.title}</p>
        <div className="mt-1 text-sm">
          <Price min={product.minPrice} max={product.maxPrice} compareAt={product.compareAtPrice} />
        </div>
      </div>
    </Link>
  );
}

export function ProductGrid({ products }: { products: ProductCardData[] }) {
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 lg:grid-cols-4">
      {products.map((product) => (
        <ProductCard key={product.id} product={product} />
      ))}
    </div>
  );
}
