"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button, Input, Select } from "@/components/ui";
import type { Facets } from "@/lib/catalog";
import { rupeesParam } from "@/lib/money";

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

export function SortSelect() {
  const { params, update } = useUpdateParams();
  return (
    <label className="flex items-center gap-2 text-sm">
      Sort
      <Select value={params.get("sort") ?? ""} onChange={(event) => update({ sort: event.target.value || undefined })}>
        <option value="">{params.get("q") ? "Best match" : "Newest"}</option>
        <option value="price_asc">Price: low to high</option>
        <option value="price_desc">Price: high to low</option>
        <option value="newest">Newest</option>
      </Select>
    </label>
  );
}

export function Filters({ facets }: { facets: Facets }) {
  const { params, update } = useUpdateParams();
  const [minPrice, setMinPrice] = useState(rupeesParam(params.get("minPrice") ?? undefined));
  const [maxPrice, setMaxPrice] = useState(rupeesParam(params.get("maxPrice") ?? undefined));

  const paramKey = (key: string) => (key === "brand" ? "brand" : `f_${key}`);
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

  const active = [...params.keys()].some((key) => key === "brand" || key.startsWith("f_") || key === "minPrice" || key === "maxPrice" || key === "inStock");

  return (
    <aside aria-label="Filters" className="flex flex-col gap-6 text-sm">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">Filters</h2>
        {active ? (
          <button
            type="button"
            className="text-xs underline"
            onClick={() => update(Object.fromEntries([...params.keys()].filter((key) => key === "brand" || key.startsWith("f_") || ["minPrice", "maxPrice", "inStock"].includes(key)).map((key) => [key, undefined])))}
          >
            Clear all
          </button>
        ) : null}
      </div>

      <label className="flex items-center gap-2">
        <input type="checkbox" checked={params.get("inStock") === "true"} onChange={(event) => update({ inStock: event.target.checked ? "true" : undefined })} />
        In stock only
      </label>

      <form onSubmit={applyPrice} className="flex flex-col gap-2">
        <p className="font-medium">Price (₹)</p>
        <div className="flex items-center gap-2">
          <Input inputMode="numeric" aria-label="Minimum price in rupees" placeholder={facets.price ? String(Math.floor(facets.price.min / 100)) : "Min"} value={minPrice} onChange={(event) => setMinPrice(event.target.value)} className="w-full" />
          <span>–</span>
          <Input inputMode="numeric" aria-label="Maximum price in rupees" placeholder={facets.price ? String(Math.ceil(facets.price.max / 100)) : "Max"} value={maxPrice} onChange={(event) => setMaxPrice(event.target.value)} className="w-full" />
        </div>
        <Button type="submit" className="py-1.5">
          Apply
        </Button>
      </form>

      {facets.facets.map((group) => (
        <fieldset key={group.key} className="flex flex-col gap-1.5">
          <legend className="mb-1.5 font-medium">{group.label}</legend>
          {group.values.slice(0, 20).map((option) => {
            const checked = selected(group.key).includes(option.value);
            return (
              <label key={option.value} className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2">
                  <input type="checkbox" checked={checked} onChange={() => toggle(group.key, option.value)} />
                  {option.value === "true" ? "Yes" : option.value === "false" ? "No" : option.value}
                </span>
                <span className="text-xs text-black/40 dark:text-white/40">{option.count}</span>
              </label>
            );
          })}
        </fieldset>
      ))}
    </aside>
  );
}
