"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, type CSSProperties, type FormEvent } from "react";
import type { CategoryNode, Facets } from "@/lib/catalog";
import { formatInr, rupeesParam } from "@/lib/money";

// Filters are plain URL params (f_<key>=a,b, minPrice, maxPrice in paise, inStock), so every filtered view is a
// shareable, server-rendered URL.
function useUpdateParams() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  return {
    params,
    update(patch: Record<string, string | undefined>) {
      const next = new URLSearchParams(params.toString());
      next.delete("page");
      for (const [key, value] of Object.entries(patch)) {
        if (value) next.set(key, value);
        else next.delete(key);
      }
      router.push(`${pathname}${next.size ? `?${next.toString()}` : ""}`, { scroll: false });
    },
  };
}

const heading: CSSProperties = { fontSize: 12, letterSpacing: ".14em", textTransform: "uppercase", fontWeight: 600, marginBottom: 10 };
const divided: CSSProperties = { borderTop: "1px solid var(--color-divider)", paddingTop: 20 };
const count: CSSProperties = { fontSize: 12, opacity: 0.55 };

export function SortSelect() {
  const { params, update } = useUpdateParams();
  return (
    <label style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13 }}>
      Sort by
      <select className="input" value={params.get("sort") ?? ""} onChange={(event) => update({ sort: event.target.value || undefined })} style={{ width: "auto", minHeight: 42 }}>
        <option value="">{params.get("q") ? "Best match" : "Newest"}</option>
        <option value="price_asc">Price: low to high</option>
        <option value="price_desc">Price: high to low</option>
        <option value="newest">Newest</option>
      </select>
    </label>
  );
}

const paramKey = (key: string) => (key === "brand" ? "brand" : `f_${key}`);
const isFilterKey = (key: string) => key === "brand" || key.startsWith("f_") || ["minPrice", "maxPrice", "inStock"].includes(key);

export function ActiveChips({ category }: { category?: string }) {
  const { params, update } = useUpdateParams();
  const chips: { label: string; remove: () => void }[] = [];
  for (const key of params.keys()) {
    if (!isFilterKey(key)) continue;
    const value = params.get(key) ?? "";
    if (key === "minPrice") chips.push({ label: `From ${formatInr(Number(value))}`, remove: () => update({ minPrice: undefined }) });
    else if (key === "maxPrice") chips.push({ label: `Up to ${formatInr(Number(value))}`, remove: () => update({ maxPrice: undefined }) });
    else if (key === "inStock") chips.push({ label: "In stock", remove: () => update({ inStock: undefined }) });
    else
      for (const item of value.split(",").filter(Boolean))
        chips.push({
          label: item,
          remove: () =>
            update({
              [key]:
                value
                  .split(",")
                  .filter((v) => v !== item)
                  .join(",") || undefined,
            }),
        });
  }
  if (category) chips.unshift({ label: category, remove: () => update({ category: undefined }) });
  if (!chips.length) return null;
  const clearAll = () => update(Object.fromEntries([...params.keys()].filter(isFilterKey).map((key) => [key, undefined])));
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
      {chips.map((chip, index) => (
        <button key={`${chip.label}-${index}`} type="button" onClick={chip.remove} style={{ display: "inline-flex", alignItems: "center", gap: 8, font: "inherit", fontSize: 13, padding: "6px 12px", minHeight: 34, cursor: "pointer", border: "1px solid var(--color-text)", background: "transparent", color: "var(--color-text)", borderRadius: "var(--pill,0px)" }}>
          {chip.label}
          <span aria-hidden="true">×</span>
        </button>
      ))}
      <button type="button" className="btn btn-ghost" onClick={clearAll}>
        Clear all
      </button>
    </div>
  );
}

export function Filters({ facets, categories, activeCategory }: { facets: Facets; categories: CategoryNode[]; activeCategory?: string }) {
  const { params, update } = useUpdateParams();
  const [minPrice, setMinPrice] = useState(rupeesParam(params.get("minPrice") ?? undefined));
  const [maxPrice, setMaxPrice] = useState(rupeesParam(params.get("maxPrice") ?? undefined));

  const selected = (key: string): string[] => (params.get(paramKey(key)) ?? "").split(",").filter(Boolean);
  const toggle = (key: string, value: string) => {
    const current = selected(key);
    const next = current.includes(value) ? current.filter((item) => item !== value) : [...current, value];
    update({ [paramKey(key)]: next.join(",") || undefined });
  };

  function applyPrice(event: FormEvent) {
    event.preventDefault();
    const toPaise = (rupees: string) => (/^\d+$/.test(rupees.trim()) ? String(Number(rupees.trim()) * 100) : undefined);
    update({ minPrice: toPaise(minPrice), maxPrice: toPaise(maxPrice) });
  }

  return (
    <aside aria-label="Filters" style={{ flex: "1 1 220px", maxWidth: 280, position: "sticky", top: 140, display: "flex", flexDirection: "column", gap: 28 }}>
      <div>
        <div style={heading}>Category</div>
        <label className="vk-radio">
          <span style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
            <input type="radio" name="vk-cat" checked={!activeCategory} onChange={() => update({ category: undefined })} />
            <span className="dot" />
            All
          </span>
        </label>
        {categories.map((category) => (
          <label key={category.id} className="vk-radio">
            <span style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
              <input type="radio" name="vk-cat" checked={activeCategory === category.slug} onChange={() => update({ category: category.slug })} />
              <span className="dot" />
              {category.name}
            </span>
          </label>
        ))}
      </div>

      <form onSubmit={applyPrice} style={divided}>
        <div style={heading}>Price (₹)</div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <input className="input" inputMode="numeric" aria-label="Minimum price in rupees" placeholder={facets.price ? String(Math.floor(facets.price.min / 100)) : "Min"} value={minPrice} onChange={(event) => setMinPrice(event.target.value)} style={{ minHeight: 42 }} />
          <span>–</span>
          <input className="input" inputMode="numeric" aria-label="Maximum price in rupees" placeholder={facets.price ? String(Math.ceil(facets.price.max / 100)) : "Max"} value={maxPrice} onChange={(event) => setMaxPrice(event.target.value)} style={{ minHeight: 42 }} />
        </div>
        <button type="submit" className="btn btn-secondary" style={{ marginTop: 10, minHeight: 42, width: "100%" }}>
          Apply
        </button>
      </form>

      {facets.facets.map((group) => (
        <fieldset key={group.key} style={{ ...divided, border: 0, borderTop: "1px solid var(--color-divider)", margin: 0, padding: "20px 0 0", minWidth: 0 }}>
          <legend style={{ ...heading, padding: 0, float: "left", width: "100%" }}>{group.label}</legend>
          <div style={{ clear: "both" }}>
            {group.values.slice(0, 20).map((option) => (
              <label key={option.value} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", fontSize: 14, cursor: "pointer" }}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
                  <input type="checkbox" checked={selected(group.key).includes(option.value)} onChange={() => toggle(group.key, option.value)} />
                  {option.value === "true" ? "Yes" : option.value === "false" ? "No" : option.value}
                </span>
                <span style={count}>{option.count}</span>
              </label>
            ))}
          </div>
        </fieldset>
      ))}

      <div style={{ ...divided, display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ ...heading, marginBottom: 0 }}>Availability</div>
        <label style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 14, cursor: "pointer" }}>
          <input type="checkbox" checked={params.get("inStock") === "true"} onChange={(event) => update({ inStock: event.target.checked ? "true" : undefined })} />
          In stock only
        </label>
      </div>
    </aside>
  );
}
