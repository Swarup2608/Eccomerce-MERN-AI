import { ObjectId } from "mongodb";
import { getDb } from "./db.js";
import { BadRequest } from "./recommend.js";

export const VALUES = ["like", "dislike"] as const;
export type FeedbackValue = (typeof VALUES)[number];
export interface Prefs { liked: string[]; disliked: string[] }

const col = async () => (await getDb()).collection("stylist_feedback");

/** "clear" removes the shopper's earlier reaction to that product. */
export async function setFeedback(userId: string, input: unknown): Promise<void> {
  const i = (input ?? {}) as Record<string, unknown>;
  const productId = typeof i.productId === "string" ? i.productId : "";
  if (!ObjectId.isValid(productId)) throw new BadRequest("productId is not valid");
  const exists = await (await getDb()).collection("products").countDocuments({ _id: new ObjectId(productId) }, { limit: 1 });
  if (!exists) throw new BadRequest("unknown product");
  const c = await col();
  if (i.value === "clear") { await c.deleteOne({ userId, productId }); return; }
  if (!(VALUES as readonly unknown[]).includes(i.value)) throw new BadRequest(`value must be one of: ${VALUES.join(", ")}, clear`);
  await c.updateOne({ userId, productId }, { $set: { value: i.value, at: new Date() } }, { upsert: true });
}

export async function loadPrefs(userId: string | undefined): Promise<Prefs> {
  if (!userId) return { liked: [], disliked: [] };
  const docs = await (await col()).find({ userId }).sort({ at: -1 }).limit(200).toArray();
  return { liked: docs.filter((d) => d.value === "like").map((d) => d.productId as string), disliked: docs.filter((d) => d.value === "dislike").map((d) => d.productId as string) };
}
