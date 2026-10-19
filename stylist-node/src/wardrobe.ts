import { ObjectId } from "mongodb";
import { getDb } from "./db.js";
import { BadRequest } from "./recommend.js";

export const WARDROBE_CATEGORIES = ["dress", "top", "bottom", "ethnic", "outerwear", "footwear", "accessory"] as const;
export const WARDROBE_OCCASIONS = ["Casual", "Party", "Work", "Festive"] as const; // same words as the shop's dress "occasion" attribute
export type WardrobeCategory = (typeof WARDROBE_CATEGORIES)[number];

export interface WardrobeInput {
  name: string;
  category: WardrobeCategory;
  color: string;
  material: string;
  fit: string;
  length: string;
  occasions: string[];
  description: string;
  /** A small JPEG/PNG/WebP data URL; the browser shrinks photos before sending. */
  image: string;
}
export interface WardrobeItem extends WardrobeInput { id: string; createdAt: string }

export const MAX_ITEMS = 100;
export const MAX_IMAGE_CHARS = 600_000;
const IMAGE = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/;

export function validateItem(input: unknown): WardrobeInput {
  const i = (input ?? {}) as Record<string, unknown>;
  const text = (k: string, max: number, required = false): string => {
    const v = typeof i[k] === "string" ? (i[k] as string).trim() : "";
    if (required && !v) throw new BadRequest(`${k} is required`);
    if (v.length > max) throw new BadRequest(`${k} must be at most ${max} characters`);
    return v;
  };
  const category = text("category", 20, true);
  if (!(WARDROBE_CATEGORIES as readonly string[]).includes(category)) throw new BadRequest(`category must be one of: ${WARDROBE_CATEGORIES.join(", ")}`);
  const occasions = Array.isArray(i.occasions) ? i.occasions : [];
  if (occasions.some((o) => !(WARDROBE_OCCASIONS as readonly string[]).includes(o as string))) throw new BadRequest(`occasions must be from: ${WARDROBE_OCCASIONS.join(", ")}`);
  const image = text("image", MAX_IMAGE_CHARS, true);
  if (!IMAGE.test(image)) throw new BadRequest("image must be a JPEG, PNG or WebP photo");
  return {
    name: text("name", 80, true), category: category as WardrobeCategory, color: text("color", 30), material: text("material", 30),
    fit: text("fit", 30), length: text("length", 30), occasions: [...new Set(occasions as string[])],
    description: text("description", 1000), image,
  };
}

const items = async () => (await getDb()).collection("wardrobe_items");
const view = (d: Record<string, unknown> & { _id: ObjectId; createdAt: Date }): WardrobeItem => {
  const { _id, userId: _u, createdAt, ...rest } = d;
  return { id: String(_id), createdAt: createdAt.toISOString(), ...(rest as unknown as WardrobeInput) };
};

export async function listItems(userId: string): Promise<WardrobeItem[]> {
  const docs = await (await items()).find({ userId }).sort({ createdAt: -1 }).limit(MAX_ITEMS).toArray();
  return docs.map((d) => view(d as never));
}

export async function addItem(userId: string, input: WardrobeInput): Promise<WardrobeItem> {
  const col = await items();
  if ((await col.countDocuments({ userId })) >= MAX_ITEMS) throw new BadRequest(`Your wardrobe is full (${MAX_ITEMS} items). Remove one to add another.`);
  const doc = { userId, ...input, createdAt: new Date() };
  const { insertedId } = await col.insertOne(doc);
  return view({ ...doc, _id: insertedId } as never);
}

export async function removeItem(userId: string, id: string): Promise<boolean> {
  if (!ObjectId.isValid(id)) return false;
  return (await (await items()).deleteOne({ _id: new ObjectId(id), userId })).deletedCount === 1;
}
