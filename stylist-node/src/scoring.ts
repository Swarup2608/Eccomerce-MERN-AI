// Rule-based stylist: no ML, no LLM, so it costs nothing to run. Every score contributes a human-readable reason.
import type { WeatherSummary } from "./weather.js";

export const OCCASIONS = ["casual", "sightseeing", "business", "wedding", "party", "religious", "beach", "festive"] as const;
export type Occasion = (typeof OCCASIONS)[number];
export type Band = "hot" | "warm" | "mild" | "cold";

export interface Variant { isActive: boolean; stock: number; price: number; compareAtPrice?: number | null; options?: Record<string, string> }
export interface ProductDoc {
  _id?: unknown;
  category?: unknown;
  title: string;
  description?: string;
  slug?: string;
  brand?: string;
  tags?: string[];
  attributes?: Record<string, unknown>;
  variants: Variant[];
  images?: { url: string }[];
  isFeatured?: boolean;
  minPrice?: number;
}
export interface Ctx {
  occasion: Occasion;
  // Absent when the user gave no place or temperature: weather rules are then skipped.
  weather?: Pick<WeatherSummary, "avgC" | "rainyDays"> | undefined;
  color?: string | undefined;
  size?: string | undefined;
}
export interface Ranked { product: ProductDoc; score: number; reasons: string[] }

// Catalog "occasion" attribute values are Casual / Party / Work / Festive.
const OCCASION_TAGS: Record<Occasion, string[]> = {
  casual: ["Casual"], sightseeing: ["Casual"], beach: ["Casual"],
  business: ["Work"], party: ["Party"], wedding: ["Festive", "Party"], festive: ["Festive"], religious: ["Festive"],
};
// Preferred hem length per occasion; modest/covered occasions lean longer.
const OCCASION_LENGTH: Partial<Record<Occasion, string[]>> = { wedding: ["Maxi", "Midi"], religious: ["Maxi", "Midi"], business: ["Midi", "Maxi"], party: ["Mini", "Midi"], beach: ["Mini", "Midi"] };

// Ethnic wear is only suggested for these occasions; anywhere else it is pushed down (the shop's kurtas carry no occasion attribute, so nothing else would).
const ETHNIC = /kurta|kurti|saree|sari|lehenga|anarkali|sherwani|salwar|churidar|dhoti|ethnic/i;
const ETHNIC_OCCASIONS: Occasion[] = ["wedding", "festive", "religious"];

// Gym and loungewear only suits relaxed occasions.
const SPORTY = /sweatshirt|hoodie|lounge|track ?pant|jogger|sports?\b|training|gym|activewear/i;
const SPORTY_OK: Occasion[] = ["casual", "sightseeing", "beach"];

// Plain tees are not business or ceremony wear.
const TEE = /t-?shirt|\btee\b/i;
const TEE_NOT_OK: Occasion[] = ["business", "wedding", "religious", "festive"];

// Beach, resort and "casual" pieces are not office or temple wear (the shop's beach shirts carry no occasion attribute either).
const LEISURE = /\bcasual\b|beach|resort|hawaiian/i;
const LEISURE_NOT_OK: Occasion[] = ["business", "religious"];

const AIRY = ["Cotton", "Linen", "Rayon"];
const WARM = ["Wool", "Blend", "Polyester", "Denim"];
const RAIN_SENSITIVE = ["Silk", "Linen"];

export function temperatureBand(avgC: number): Band {
  if (avgC >= 30) return "hot";
  if (avgC >= 22) return "warm";
  if (avgC >= 14) return "mild";
  return "cold";
}

const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : v == null ? [] : [v]);
const inStock = (p: ProductDoc) => p.variants.filter((v) => v.isActive && v.stock > 0);

export function scoreProduct(product: ProductDoc, ctx: Ctx): { score: number; reasons: string[] } {
  const a = product.attributes ?? {};
  const material = a.material as string | undefined;
  const length = a.length as string | undefined;
  const w = ctx.weather;
  const band = w ? temperatureBand(w.avgC) : null;
  const reasons: string[] = [];
  let score = 0;
  const add = (points: number, reason?: string) => { score += points; if (reason) reasons.push(reason); };

  if (ETHNIC.test(`${product.title} ${(product.tags ?? []).join(" ")}`) && !ETHNIC_OCCASIONS.includes(ctx.occasion)) add(-60);

  if (SPORTY.test(product.title) && !SPORTY_OK.includes(ctx.occasion)) add(-60);

  if (TEE.test(product.title) && TEE_NOT_OK.includes(ctx.occasion)) add(-45);

  if (LEISURE.test(`${product.title} ${(product.tags ?? []).join(" ")}`) && LEISURE_NOT_OK.includes(ctx.occasion)) add(-45);

  const occasions = list(a.occasion);
  if (OCCASION_TAGS[ctx.occasion].some((o) => occasions.includes(o))) add(40, `made for ${ctx.occasion}`);
  else if (occasions.length) add(-15);
  if (`${product.title} ${(product.tags ?? []).join(" ")}`.toLowerCase().includes(ctx.occasion)) add(10, `tagged ${ctx.occasion}`);

  if (!w) {
    // No weather to judge by.
  } else if (band === "hot" || band === "warm") {
    if (material && AIRY.includes(material)) add(25, `${material} stays cool at ~${w!.avgC}°C`);
    if (material && WARM.includes(material)) add(-25);
    if (a.fit === "Relaxed") add(8, "relaxed fit for the heat");
    if (band === "hot" && length && ["Mini", "Midi"].includes(length)) add(10, `${length.toLowerCase()} length for hot weather`);
  } else if (band === "cold") {
    if (material && WARM.includes(material)) add(25, `${material} keeps you warm at ~${w!.avgC}°C`);
    if (material && AIRY.includes(material)) add(-10);
    if (length === "Maxi") add(15, "maxi length for the cold");
    if (length === "Mini") add(-20);
  } else if (material && [...WARM, ...AIRY].includes(material)) add(8, "comfortable at mild temperatures");

  if ((w?.rainyDays ?? 0) > 0 && material && RAIN_SENSITIVE.includes(material)) add(-12);
  if ((w?.rainyDays ?? 0) > 0 && material && ["Polyester", "Blend", "Rayon"].includes(material)) add(6, "dries quickly in rain");
  if (length && OCCASION_LENGTH[ctx.occasion]?.includes(length)) add(10, `${length.toLowerCase()} length suits ${ctx.occasion}`);

  const stocked = inStock(product);
  if (ctx.color && stocked.some((v) => v.options?.color?.toLowerCase() === ctx.color!.toLowerCase())) add(15, `available in ${ctx.color}`);
  if (ctx.size && !stocked.some((v) => v.options?.size?.toLowerCase() === ctx.size!.toLowerCase())) add(-100); // can't wear it, so effectively exclude
  if (product.variants.some((v) => v.compareAtPrice && v.compareAtPrice > v.price)) add(3, "on sale");
  if (product.isFeatured) add(2);

  return { score, reasons };
}

export function rank(products: ProductDoc[], ctx: Ctx, limit = 5): Ranked[] {
  return products
    .map((product) => ({ product, ...scoreProduct(product, ctx) }))
    .filter((r) => r.score > 0)
    .sort((x, y) => y.score - x.score)
    .slice(0, limit);
}
