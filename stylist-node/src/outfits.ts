import type { Filter } from "mongodb";
import { getDb } from "./db.js";
import { categories, categoryIds } from "./catalog.js";
import { BadRequest, candidates, resolveWeather, suggestionOf, type Suggestion } from "./recommend.js";
import { parseQuery } from "./query.js";
import { OCCASIONS, rank, scoreProduct, temperatureBand, type Ctx, type Occasion, type ProductDoc } from "./scoring.js";
import type { WardrobeItem } from "./wardrobe.js";
import type { WeatherSummary } from "./weather.js";

export const SOURCES = ["store", "wardrobe", "addons"] as const;
export type Source = (typeof SOURCES)[number];

export interface SuggestInput {
  query?: string;
  /** store = only from the shop; wardrobe = only what the user owns; addons = the user's clothes plus shop pieces to complete them. */
  source: Source;
  /** Integer paise. For add-ons it is the total for everything added. */
  budget?: number;
  occasion?: Occasion;
  startDate?: string;
  endDate?: string;
  city?: string;
  temperatureC?: number;
}

export interface Outfit {
  itemIds: string[];
  score: number;
  reasons: string[];
  addons: { slot: string; options: Suggestion[] }[];
}

const NEUTRALS = ["black", "white", "grey", "navy", "beige", "brown"];
const lower = (s: string | undefined) => (s ?? "").toLowerCase();
const harmony = (a: string, b: string) => (!a || !b ? 0 : a === b ? 6 : NEUTRALS.includes(a) || NEUTRALS.includes(b) ? 4 : 0);

// Wardrobe items are scored by the same rules as shop dresses.
const asProduct = (w: WardrobeItem): ProductDoc => ({
  title: `${w.name} ${w.description}`, tags: [],
  attributes: { material: w.material, fit: w.fit, length: w.length, occasion: w.occasions },
  variants: [{ isActive: true, stock: 1, price: 0, options: { color: w.color } }],
});

export function buildOutfits(wardrobe: WardrobeItem[], ctx: Ctx, limit = 3): Outfit[] {
  const scored = wardrobe.map((item) => ({ item, ...scoreProduct(asProduct(item), ctx) }));
  const best = (cat: string) => scored.filter((s) => s.item.category === cat).sort((a, b) => b.score - a.score);
  const cold = !!ctx.weather && temperatureBand(ctx.weather.avgC) === "cold";
  const bases: { ids: string[]; colors: string[]; score: number; reasons: string[] }[] = [];

  for (const s of [...best("dress"), ...best("ethnic")].filter((x) => x.score > 0))
    bases.push({ ids: [s.item.id], colors: [lower(s.item.color)], score: s.score, reasons: s.reasons.map((r) => `${s.item.name}: ${r}`) });
  for (const t of best("top").slice(0, 4)) for (const b of best("bottom").slice(0, 4)) {
    const h = harmony(lower(t.item.color), lower(b.item.color));
    const score = (t.score + b.score) / 2 + h;
    if (score > 0) bases.push({ ids: [t.item.id, b.item.id], colors: [lower(t.item.color), lower(b.item.color)], score, reasons: [...t.reasons.map((r) => `${t.item.name}: ${r}`), ...(h ? [`${t.item.color} and ${b.item.color} go together`] : [])] });
  }

  return bases.sort((a, b) => b.score - a.score).slice(0, limit).map((base) => {
    let score = base.score;
    const ids = [...base.ids];
    const reasons = [...base.reasons];
    for (const slot of cold ? ["outerwear", "footwear", "accessory"] : ["footwear", "accessory"]) {
      const pick = best(slot).find((s) => s.score >= 0);
      if (!pick) continue;
      ids.push(pick.item.id);
      score += pick.score / 4 + Math.max(...base.colors.map((c) => harmony(c, lower(pick.item.color))));
      reasons.push(`add your ${pick.item.name}`);
    }
    return { itemIds: ids, score: Math.round(score), reasons, addons: [] };
  });
}

// What a shop footwear / accessory category is good for.
const ADDON_RULES: Record<string, { slot: "footwear" | "accessory"; for: Occasion[] }> = {
  sneakers: { slot: "footwear", for: ["casual", "sightseeing"] },
  "formal-shoes": { slot: "footwear", for: ["business", "party", "wedding"] },
  sandals: { slot: "footwear", for: ["casual", "beach", "festive", "religious", "wedding", "party", "sightseeing"] },
  bags: { slot: "accessory", for: ["casual", "sightseeing", "business", "beach"] },
  watches: { slot: "accessory", for: ["business", "party", "wedding", "casual"] },
  belts: { slot: "accessory", for: ["business"] },
  jewellery: { slot: "accessory", for: ["wedding", "party", "festive", "religious"] },
};

export function scoreAddon(product: ProductDoc, leafSlug: string, ctx: Ctx, outfitColors: string[]): { score: number; reasons: string[] } {
  const rule = ADDON_RULES[leafSlug];
  if (!rule) return { score: 0, reasons: [] };
  let score = 0;
  const reasons: string[] = [];
  if (rule.for.includes(ctx.occasion)) { score += 30; reasons.push(`suits ${ctx.occasion}`); }
  const color = lower(product.variants.find((v) => v.isActive && v.stock > 0)?.options?.color);
  const h = Math.max(0, ...outfitColors.map((c) => harmony(c, color)));
  if (h) { score += h * 2; reasons.push(h >= 6 ? `matches your ${color}` : `${color} pairs with anything`); }
  if (leafSlug === "sandals" && ctx.weather) {
    if (ctx.weather.avgC >= 28) { score += 10; reasons.push("open footwear for the heat"); }
    if (ctx.weather.rainyDays > 0 || ctx.weather.avgC < 15) score -= 15;
  }
  if (product.isFeatured) score += 2;
  return { score, reasons };
}

async function addonProducts(maxPrice?: number): Promise<{ products: ProductDoc[]; ruleOf: (p: ProductDoc) => string }> {
  const cats = await categories();
  const ids = await categoryIds(["footwear", "accessory"]);
  if (!ids.length) return { products: [], ruleOf: () => "" };
  const filter: Filter<ProductDoc> = { status: "active", totalStock: { $gt: 0 }, category: { $in: ids } };
  if (maxPrice !== undefined) filter.minPrice = { $lte: maxPrice };
  const products = await (await getDb()).collection<ProductDoc>("products").find(filter).limit(500).toArray();
  return { products, ruleOf: (p) => cats.get(String(p.category))?.rule ?? "" };
}

export async function attachAddons(outfits: Outfit[], wardrobe: WardrobeItem[], ctx: Ctx, budget?: number): Promise<void> {
  const { products, ruleOf } = await addonProducts(budget);
  const byId = new Map(wardrobe.map((w) => [w.id, w]));
  for (const outfit of outfits) {
    const owned = outfit.itemIds.map((id) => byId.get(id)).filter((w): w is WardrobeItem => !!w);
    const colors = owned.map((w) => lower(w.color)).filter(Boolean);
    const hasFootwear = owned.some((w) => w.category === "footwear");
    let remaining = budget ?? Infinity;
    // Footwear only if the outfit has none; an accessory is always offered as a finishing touch.
    for (const slot of hasFootwear ? (["accessory"] as const) : (["footwear", "accessory"] as const)) {
      const options = products
        .filter((p) => (p.minPrice ?? 0) <= remaining && ADDON_RULES[ruleOf(p)]?.slot === slot)
        .map((p) => ({ p, ...scoreAddon(p, ruleOf(p), ctx, colors) }))
        .filter((r) => r.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 2);
      if (!options.length) continue;
      remaining -= options[0]!.p.minPrice ?? 0;
      outfit.addons.push({ slot, options: options.map((o) => suggestionOf(o.p, o.score, o.reasons)) });
    }
  }
}

export async function suggest(input: unknown, wardrobe: WardrobeItem[]) {
  const i = (input ?? {}) as Record<string, unknown>;
  const source = SOURCES.find((s) => s === i.source);
  if (!source) throw new BadRequest(`source must be one of: ${SOURCES.join(", ")}`);
  const query = typeof i.query === "string" ? i.query.slice(0, 300) : "";
  const parsed = parseQuery(query);
  const occasion = (OCCASIONS as readonly string[]).includes(i.occasion as string) ? (i.occasion as Occasion) : parsed.occasion ?? "casual";
  const budget = typeof i.budget === "number" && i.budget > 0 ? Math.round(i.budget) : parsed.budget;
  const startDate = typeof i.startDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(i.startDate) ? i.startDate : undefined;
  const endDate = typeof i.endDate === "string" && startDate && /^\d{4}-\d{2}-\d{2}$/.test(i.endDate) && i.endDate >= startDate ? i.endDate : undefined;
  const city = typeof i.city === "string" && i.city.trim() ? i.city.trim().slice(0, 80) : undefined;
  const temperatureC = typeof i.temperatureC === "number" && Number.isFinite(i.temperatureC) ? i.temperatureC : undefined;

  const notes: string[] = [];
  let place: string | undefined;
  let weather: WeatherSummary | undefined;
  if (temperatureC !== undefined || (city && startDate)) {
    try {
      ({ place, weather } = await resolveWeather({ startDate: startDate ?? new Date().toISOString().slice(0, 10), occasion, ...(city && { city }), ...(temperatureC !== undefined && { temperatureC }), ...(endDate && { endDate }) }));
    } catch {
      notes.push("Couldn't get the weather for that place, so these suggestions ignore it.");
    }
  } else notes.push("Add a place and date to get weather-aware suggestions.");
  const ctx: Ctx = { occasion, weather, color: parsed.colors[0] };

  const result = { source, occasion, budget: budget ?? null, place: place ?? null, weather: weather ?? null, notes, store: [] as Suggestion[], outfits: [] as Outfit[] };
  if (source === "store") {
    const products = await candidates(budget);
    result.store = rank(products, ctx, 8).map((r) => suggestionOf(r.product, r.score, r.reasons));
    if (!result.store.length) notes.push("Nothing in the shop matched. Try a higher budget or a different occasion.");
    return result;
  }
  if (!wardrobe.length) {
    notes.push("Your wardrobe is empty. Add a few pieces first.");
    return result;
  }
  result.outfits = buildOutfits(wardrobe, ctx);
  if (!result.outfits.length) notes.push("Nothing in your wardrobe fits this occasion and weather.");
  else if (source === "addons") await attachAddons(result.outfits, wardrobe, ctx, budget);
  return result;
}
