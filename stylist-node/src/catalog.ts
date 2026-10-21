import type { ObjectId } from "mongodb";
import { getDb } from "./db.js";

export type Kind = "dress" | "footwear" | "accessory";

// Which kind of garment a category is, read from the category names in the shop's own tree (its name plus its ancestors').
// The shop has no "type" field, so names are the only signal; add words here if your categories use others.
const KIND_WORDS: [Kind, RegExp][] = [
  ["footwear", /footwear|shoe|sneaker|sandal|loafer|heel|boot|slipper|flip/],
  ["accessory", /accessor|bag|backpack|handbag|watch|belt|jewel|necklace|earring|bracelet|scarf|sunglass/],
  ["dress", /dress|gown|kurta|kurti|saree|sari|lehenga|frock|jumpsuit|anarkali|co-?ord|shirt|polo|tops?\b|blouse/],
];

// Maps a leaf category's name to the add-on rule that describes it (see ADDON_RULES in outfits.ts).
const RULE_WORDS: [string, RegExp][] = [
  ["sneakers", /sneaker|running|trainer|sports? shoe/],
  ["formal-shoes", /formal|oxford|derby|loafer|heel/],
  ["sandals", /sandal|slipper|flip|sliders?/],
  ["bags", /bag|backpack|tote|clutch/],
  ["watches", /watch/],
  ["belts", /belt/],
  ["jewellery", /jewel|necklace|earring|bracelet|bangle|ring/],
];

export type Gender = "women" | "men";
export const GENDERS = ["women", "men"] as const;

export interface CategoryInfo { id: ObjectId; kind: Kind | null; rule: string; gender: Gender | null }

// "Women > Dresses" is women's, "Men > Shirts" is men's; shared trees (Footwear, Bags ...) have no gender here and are filtered per product.
const genderOf = (chain: string): Gender | null => (/\bwomen|\bladies/.test(chain) ? "women" : /\bmen/.test(chain) ? "men" : null);

// Products in shared categories may carry a Men / Women / Unisex attribute; products without one are kept.
export const genderFilter = (gender: Gender | undefined) =>
  gender ? { $or: [{ "attributes.gender": { $exists: false } }, { "attributes.gender": { $in: [gender === "men" ? "Men" : "Women", "Unisex"] } }] } : {};

let cache: { at: number; byId: Map<string, CategoryInfo> } | undefined;

export async function categories(): Promise<Map<string, CategoryInfo>> {
  if (cache && Date.now() - cache.at < 5 * 60_000) return cache.byId;
  const docs = await (await getDb()).collection("categories").find({ isActive: { $ne: false } }).project({ name: 1, slug: 1, ancestors: 1 }).toArray();
  const names = new Map(docs.map((d) => [String(d._id), `${d.name} ${d.slug}`.toLowerCase()]));
  const byId = new Map<string, CategoryInfo>();
  for (const d of docs) {
    const own = names.get(String(d._id)) ?? "";
    const chain = [...((d.ancestors as ObjectId[] | undefined) ?? []).map((a) => names.get(String(a)) ?? ""), own].join(" ");
    // The nearest category wins: "Women > Footwear > Sandals" is footwear even if a parent mentions another kind.
    const kind = KIND_WORDS.find(([, re]) => re.test(own))?.[0] ?? KIND_WORDS.find(([, re]) => re.test(chain))?.[0] ?? null;
    byId.set(String(d._id), { id: d._id as ObjectId, kind, rule: RULE_WORDS.find(([, re]) => re.test(own))?.[0] ?? "", gender: genderOf(chain) });
  }
  cache = { at: Date.now(), byId };
  return byId;
}

export async function categoryIds(kinds: Kind[], gender?: Gender): Promise<ObjectId[]> {
  return [...(await categories()).values()].filter((c) => c.kind && kinds.includes(c.kind) && (!gender || !c.gender || c.gender === gender)).map((c) => c.id);
}
