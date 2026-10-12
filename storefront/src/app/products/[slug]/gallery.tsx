"use client";

import { useState } from "react";
import { ProductPhoto } from "@/components/ui";
import type { ProductImage } from "@/lib/catalog";

export function Gallery({ images, title }: { images: ProductImage[]; title: string }) {
  const [index, setIndex] = useState(0);
  const current = images[index];
  return (
    <div className="flex flex-col gap-3">
      <ProductPhoto src={current?.url} alt={current?.alt || title} eager className="aspect-[4/5] w-full rounded-lg" />
      {images.length > 1 ? (
        <div className="flex gap-2 overflow-x-auto">
          {images.map((image, i) => (
            <button key={image.key} type="button" onClick={() => setIndex(i)} aria-label={`Show image ${i + 1}`} aria-pressed={i === index} className={`shrink-0 overflow-hidden rounded-md border-2 ${i === index ? "border-foreground" : "border-transparent"}`}>
              <ProductPhoto src={image.url} alt="" className="size-16" />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
