"use client";

import { useState } from "react";
import type { ProductImage } from "@/lib/catalog";

export function Gallery({ images, title, discount }: { images: ProductImage[]; title: string; discount: number }) {
  const [index, setIndex] = useState(0);
  const current = images[index];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, position: "sticky", top: 140 }}>
      <div style={{ position: "relative", aspectRatio: "4/5", background: "var(--color-surface)", overflow: "hidden" }}>
        {current ? <span role="img" aria-label={current.alt || title} style={{ display: "block", position: "absolute", inset: 0, width: "100%", height: "100%", background: `var(--color-surface) url(${current.url}) center/cover no-repeat` }} /> : null}
        {discount > 0 ? (
          <span className="tag tag-accent" style={{ position: "absolute", left: 16, bottom: 16 }}>
            −{discount}%
          </span>
        ) : null}
      </div>
      {images.length > 1 ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 12 }}>
          {images.slice(0, 8).map((image, i) => (
            <button key={image.key} type="button" onClick={() => setIndex(i)} aria-label={`Show image ${i + 1}`} aria-pressed={i === index} style={{ aspectRatio: "1/1", cursor: "pointer", padding: 0, overflow: "hidden", background: "var(--color-surface)", border: `2px solid ${i === index ? "var(--color-text)" : "transparent"}` }}>
              <span role="img" aria-label="" style={{ display: "block", width: "100%", height: "100%", background: `var(--color-surface) url(${image.url}) center/cover no-repeat` }} />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function Accordion({ items }: { items: { id: string; title: string; body?: string; rows?: { k: string; v: string }[] }[] }) {
  const [open, setOpen] = useState<string | null>(items[0]?.id ?? null);
  return (
    <div style={{ borderTop: "1px solid var(--color-divider)" }}>
      {items.map((item) => {
        const isOpen = open === item.id;
        return (
          <div key={item.id} style={{ borderBottom: "1px solid var(--color-divider)" }}>
            <button type="button" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : item.id)} style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", padding: "18px 0", background: "none", border: 0, font: "inherit", fontSize: 16, fontWeight: 500, cursor: "pointer", color: "var(--color-text)", textAlign: "left" }}>
              {item.title}
              <span style={{ fontSize: 20 }}>{isOpen ? "−" : "+"}</span>
            </button>
            {isOpen ? (
              <div style={{ padding: "0 0 20px", fontSize: 14, lineHeight: 1.6, color: "color-mix(in srgb,var(--color-text) 75%,transparent)" }}>
                {item.body ? <p style={{ margin: 0, whiteSpace: "pre-line" }}>{item.body}</p> : null}
                {item.rows?.map((row) => (
                  <div key={row.k} style={{ display: "flex", justifyContent: "space-between", gap: 16, padding: "8px 0", borderBottom: "1px solid var(--color-divider)" }}>
                    <span>{row.k}</span>
                    <span style={{ color: "var(--color-text)", textAlign: "right" }}>{row.v}</span>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
