"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";

import { getProductBySlug, type CatalogProduct } from "@/lib/api/products";

export default function ProductDetailsPage() {
  const params = useParams<{ slug: string }>();
  const slug = params.slug;

  const [product, setProduct] = useState<CatalogProduct | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Slug the current result belongs to. Deriving loading from it avoids
  // setting state synchronously inside the effect when the slug changes.
  const [loadedSlug, setLoadedSlug] = useState<string | null>(null);
  const loading = loadedSlug !== slug;

  useEffect(() => {
    let cancelled = false;

    async function loadProduct() {
      try {
        const response = await getProductBySlug(slug);

        if (!cancelled) {
          setProduct(response.data.product);
          setError(null);
        }
      } catch (err: unknown) {
        if (!cancelled) {
          setProduct(null);
          setError(
            err instanceof Error ? err.message : "Unable to load this product.",
          );
        }
      } finally {
        if (!cancelled) {
          setLoadedSlug(slug);
        }
      }
    }

    void loadProduct();

    return () => {
      cancelled = true;
    };
  }, [slug]);

  if (loading) {
    return (
      <main className="mx-auto max-w-7xl px-6 py-20">
        <p className="animate-pulse text-slate-500">
          Loading product details...
        </p>
      </main>
    );
  }

  if (error || !product) {
    return (
      <main className="mx-auto max-w-7xl px-6 py-20">
        <h1 className="text-2xl font-black text-slate-900">
          Product unavailable
        </h1>
        <p className="mt-3 text-slate-600">
          {error ?? "This product could not be found."}
        </p>
        <Link
          href="/"
          className="mt-6 inline-flex rounded-xl bg-slate-900 px-5 py-3 text-sm font-bold text-white transition hover:bg-fuchsia-600"
        >
          Back to shop
        </Link>
      </main>
    );
  }

  const image =
    product.images.find((item) => item.isPrimary) ??
    [...product.images].sort((a, b) => a.sortOrder - b.sortOrder)[0];

  return (
    <main className="mx-auto max-w-7xl px-6 py-12">
      <Link
        href="/"
        className="text-sm font-semibold text-slate-500 transition hover:text-fuchsia-600"
      >
        ← Back to shop
      </Link>

      <div className="mt-8 grid gap-10 md:grid-cols-2">
        <div className="flex min-h-80 items-center justify-center overflow-hidden rounded-3xl bg-gradient-to-br from-violet-50 via-fuchsia-50 to-pink-100">
          {image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={image.url}
              alt={image.alt ?? product.name}
              className="h-full max-h-[600px] w-full object-contain"
            />
          ) : (
            <p className="text-slate-500">Image unavailable</p>
          )}
        </div>

        <section className="py-4">
          {product.brand && (
            <p className="text-sm font-bold tracking-widest text-fuchsia-600 uppercase">
              {product.brand}
            </p>
          )}

          <h1 className="mt-3 text-3xl font-black tracking-tight text-slate-900 md:text-5xl">
            {product.name}
          </h1>

          {product.shortDescription && (
            <p className="mt-5 text-lg text-slate-600">
              {product.shortDescription}
            </p>
          )}

          <div className="mt-8 border-t border-slate-200 pt-6">
            <h2 className="text-lg font-bold">Product description</h2>
            <p className="mt-3 leading-7 whitespace-pre-line text-slate-600">
              {product.description}
            </p>
          </div>

          {Object.keys(product.attributes).length > 0 && (
            <div className="mt-8 border-t border-slate-200 pt-6">
              <h2 className="text-lg font-bold">Specifications</h2>

              <dl className="mt-4 space-y-3">
                {Object.entries(product.attributes).map(([name, value]) => (
                  <div
                    key={name}
                    className="flex justify-between gap-6 border-b border-slate-100 pb-3"
                  >
                    <dt className="text-slate-500">{name}</dt>
                    <dd className="text-right font-medium">{value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          )}

          <p className="mt-8 text-sm text-slate-500">
            Pricing and availability will be shown when seller offers are
            integrated.
          </p>
        </section>
      </div>
    </main>
  );
}
