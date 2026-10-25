import type { Filter } from "mongodb";
import { getDb } from "./db.js";
import { categoryIds, genderFilter, type Gender, type Kind } from "./catalog.js";
import { geocode, weatherFor, type WeatherSummary } from "./weather.js";
import { OCCASIONS, rank, temperatureBand, type Occasion, type ProductDoc } from "./scoring.js";

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export class BadRequest extends Error {}

export interface RecommendInput {
  startDate: string;
  endDate?: string;
  occasion: Occasion;
  city?: string;
  lat?: number;
  lon?: number;
  temperatureC?: number;
  /** Integer paise, like the shop's prices. */
  maxPrice?: number;
  size?: string;
  color?: string;
  limit?: number;
}

export const suggestionOf = (p: ProductDoc, score: number, reasons: string[]) => ({
  id: String(p._id), title: p.title, brand: p.brand, slug: p.slug, price: p.minPrice, image: p.images?.[0]?.url ?? null, score, reasons,
  sizes: [...new Set(p.variants.filter((v) => v.isActive && v.stock > 0).map((v) => v.options?.size).filter(Boolean))],
});
export type Suggestion = ReturnType<typeof suggestionOf>;

export function validate(input: unknown): Required<Pick<RecommendInput, "limit">> & RecommendInput {
  const i = (input ?? {}) as Record<string, unknown>;
  const str = (k: string) => (typeof i[k] === "string" && i[k] ? (i[k] as string) : undefined);
  const num = (k: string) => (i[k] == null || i[k] === "" ? undefined : Number(i[k]));
  const startDate = str("startDate");
  const endDate = str("endDate");
  const occasion = str("occasion");
  if (!startDate || !DATE.test(startDate)) throw new BadRequest("startDate must be YYYY-MM-DD");
  if (endDate && (!DATE.test(endDate) || endDate < startDate)) throw new BadRequest("endDate must be YYYY-MM-DD and not before startDate");
  if (!occasion || !(OCCASIONS as readonly string[]).includes(occasion)) throw new BadRequest(`occasion must be one of: ${OCCASIONS.join(", ")}`);
  const out: RecommendInput = { startDate, occasion: occasion as Occasion };
  const optional = { endDate, city: str("city"), lat: num("lat"), lon: num("lon"), temperatureC: num("temperatureC"), maxPrice: num("maxPrice"), size: str("size"), color: str("color") };
  for (const [k, v] of Object.entries(optional)) {
    if (v === undefined) continue;
    if (typeof v === "number" && !Number.isFinite(v)) throw new BadRequest(`${k} must be a number`);
    Object.assign(out, { [k]: v });
  }
  if (out.temperatureC === undefined && !out.city && (out.lat === undefined || out.lon === undefined)) throw new BadRequest("give a city, lat+lon, or temperatureC");
  return { ...out, limit: Math.min(Math.max(Math.trunc(num("limit") ?? 5), 1), 20) };
}

export async function resolveWeather(q: RecommendInput): Promise<{ place: string; weather: WeatherSummary }> {
  if (q.temperatureC !== undefined) {
    const t = q.temperatureC;
    return { place: q.city ?? "manual", weather: { avgC: t, maxC: t, minC: t, rainyDays: 0, days: 1, source: "provided" } };
  }
  const place = q.city ? await geocode(q.city) : { name: `${q.lat},${q.lon}`, lat: q.lat!, lon: q.lon! };
  return { place: place.name, weather: await weatherFor({ lat: place.lat, lon: place.lon, startDate: q.startDate, ...(q.endDate && { endDate: q.endDate }) }) };
}

// Read-only: loads in-stock active products of the given kinds (every category the shop's tree identifies as that kind).
export async function productsOfKinds(kinds: Kind[], maxPrice?: number, gender?: Gender): Promise<ProductDoc[]> {
  const ids = await categoryIds(kinds, gender);
  if (!ids.length) return [];
  const filter = { status: "active", totalStock: { $gt: 0 }, category: { $in: ids }, ...genderFilter(gender) } as Filter<ProductDoc>;
  if (maxPrice !== undefined) filter.minPrice = { $lte: maxPrice };
  return (await getDb()).collection<ProductDoc>("products").find(filter).limit(500).toArray();
}

export const candidates = (maxPrice?: number, gender?: Gender): Promise<ProductDoc[]> => productsOfKinds(["dress"], maxPrice, gender);

export async function recommend(input: unknown) {
  const q = validate(input);
  const [{ place, weather }, products] = await Promise.all([resolveWeather(q), candidates(q.maxPrice)]);
  const ranked = rank(products, { occasion: q.occasion, weather, color: q.color, size: q.size }, q.limit);
  return {
    place,
    weather: { ...weather, band: temperatureBand(weather.avgC) },
    occasion: q.occasion,
    considered: products.length,
    suggestions: ranked.map(({ product, score, reasons }) => suggestionOf(product, score, reasons)),
  };
}
