import { Schema, Types, model } from "mongoose";
import { HttpError } from "../../lib/http-error.js";
import { Product } from "../products/product.model.js";
import { toProductCard, type ProductCard, type ProductService } from "../products/product.service.js";

export const MAX_WISHLIST_ITEMS = 200;
export const MAX_WISHLIST_LISTS = 20;
export const DEFAULT_LIST_NAME = "Saved items";

export interface IWishlistItem {
  user: Types.ObjectId;
  product: Types.ObjectId;
  // The customer's named list; null is the default "Saved items" list.
  list: Types.ObjectId | null;
  createdAt: Date;
}

export interface IWishlistList {
  user: Types.ObjectId;
  name: string;
  // Lower-cased name, so "Gifts" and "gifts" cannot both exist.
  nameKey: string;
  createdAt: Date;
}

// One document per saved product: adding is an idempotent upsert and the unique index stops duplicates. A product sits in
// exactly one of the customer's lists, so the heart on a card stays a simple saved / not saved toggle.
const wishlistItemSchema = new Schema<IWishlistItem>(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true },
    product: { type: Schema.Types.ObjectId, ref: "Product", required: true },
    list: { type: Schema.Types.ObjectId, ref: "WishlistList", default: null },
    createdAt: { type: Date, default: () => new Date() },
  },
  { versionKey: false },
);

wishlistItemSchema.index({ user: 1, product: 1 }, { unique: true });
wishlistItemSchema.index({ user: 1, createdAt: -1 });

export const WishlistItem = model<IWishlistItem>("WishlistItem", wishlistItemSchema);

const wishlistListSchema = new Schema<IWishlistList>(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true },
    name: { type: String, required: true, trim: true, maxlength: 40 },
    nameKey: { type: String, required: true },
    createdAt: { type: Date, default: () => new Date() },
  },
  { versionKey: false },
);

wishlistListSchema.index({ user: 1, nameKey: 1 }, { unique: true });

export const WishlistList = model<IWishlistList>("WishlistList", wishlistListSchema);

export interface WishlistEntry {
  product: ProductCard;
  // False once the product is archived or unpublished; it stays listed so the customer sees what happened.
  available: boolean;
  listId: string | null;
  addedAt: Date;
}

export interface WishlistGroup {
  // Null for the default list, which always exists and cannot be renamed or deleted.
  id: string | null;
  name: string;
  count: number;
  createdAt: Date | null;
}

const listNotFound = (): HttpError => new HttpError(404, "NOT_FOUND", "List not found");

const keyOf = (name: string): string => name.trim().toLocaleLowerCase("en-IN");

const isDuplicateKey = (error: unknown): boolean => typeof error === "object" && error !== null && "code" in error && error.code === 11000;

const nameTaken = (): HttpError => new HttpError(409, "LIST_NAME_TAKEN", "You already have a list with that name", [{ path: "name", message: "Already in use" }]);

export class WishlistService {
  constructor(private readonly products: ProductService) {}

  async list(userId: string): Promise<WishlistEntry[]> {
    const items = await WishlistItem.find({ user: userId }).sort({ createdAt: -1 }).limit(MAX_WISHLIST_ITEMS).lean();
    const [products, pricer] = await Promise.all([this.products.cardsByIds(items.map((item) => item.product)), this.products.pricer()]);
    return items.flatMap((item) => {
      const product = products.get(item.product.toString());
      // A hard-deleted product simply drops out.
      return product ? [{ product: toProductCard(product, pricer), available: product.status === "active", listId: item.list?.toString() ?? null, addedAt: item.createdAt }] : [];
    });
  }

  // Just the ids, so listing pages can draw filled hearts without loading the whole wishlist.
  async ids(userId: string): Promise<string[]> {
    const items = await WishlistItem.find({ user: userId }, { product: 1 }).limit(MAX_WISHLIST_ITEMS).lean();
    return items.map((item) => item.product.toString());
  }

  // Saves a product. With a listId it also moves an already-saved product into that list; without one an existing item
  // stays where it is, so tapping the heart never reshuffles the customer's lists.
  async add(userId: string, productId: string, listId?: string | null): Promise<void> {
    if (listId) await this.ownList(userId, listId);
    const existing = await WishlistItem.findOne({ user: userId, product: productId }, { _id: 1 }).lean();
    if (existing) {
      if (listId !== undefined) await WishlistItem.updateOne({ _id: existing._id }, { $set: { list: listId ? new Types.ObjectId(listId) : null } });
      return;
    }
    if (!(await Product.exists({ _id: productId, status: "active" }))) throw new HttpError(404, "NOT_FOUND", "Product not found");
    if ((await WishlistItem.countDocuments({ user: userId })) >= MAX_WISHLIST_ITEMS) throw new HttpError(422, "WISHLIST_FULL", `A wishlist holds at most ${MAX_WISHLIST_ITEMS} products`);
    await WishlistItem.updateOne({ user: userId, product: productId }, { $setOnInsert: { createdAt: new Date(), list: listId ? new Types.ObjectId(listId) : null } }, { upsert: true });
  }

  async remove(userId: string, productId: string): Promise<void> {
    await WishlistItem.deleteOne({ user: userId, product: productId });
  }

  // ---- Named lists ----

  async groups(userId: string): Promise<WishlistGroup[]> {
    const [lists, counts] = await Promise.all([
      WishlistList.find({ user: userId }).sort({ createdAt: 1 }).limit(MAX_WISHLIST_LISTS).lean(),
      WishlistItem.aggregate<{ _id: Types.ObjectId | null; count: number }>([{ $match: { user: new Types.ObjectId(userId) } }, { $group: { _id: "$list", count: { $sum: 1 } } }]),
    ]);
    const countOf = new Map(counts.map((row) => [row._id?.toString() ?? "", row.count]));
    return [
      { id: null, name: DEFAULT_LIST_NAME, count: countOf.get("") ?? 0, createdAt: null },
      ...lists.map((list) => ({ id: list._id.toString(), name: list.name, count: countOf.get(list._id.toString()) ?? 0, createdAt: list.createdAt })),
    ];
  }

  async createGroup(userId: string, name: string): Promise<WishlistGroup> {
    if (keyOf(name) === keyOf(DEFAULT_LIST_NAME)) throw nameTaken();
    if ((await WishlistList.countDocuments({ user: userId })) >= MAX_WISHLIST_LISTS) throw new HttpError(422, "LIST_LIMIT", `You can have at most ${MAX_WISHLIST_LISTS} lists`);
    try {
      const doc = await WishlistList.create({ user: userId, name: name.trim(), nameKey: keyOf(name) });
      return { id: doc._id.toString(), name: doc.name, count: 0, createdAt: doc.createdAt };
    } catch (error) {
      throw isDuplicateKey(error) ? nameTaken() : error;
    }
  }

  async renameGroup(userId: string, listId: string, name: string): Promise<WishlistGroup> {
    if (keyOf(name) === keyOf(DEFAULT_LIST_NAME)) throw nameTaken();
    let doc;
    try {
      doc = await WishlistList.findOneAndUpdate({ _id: listId, user: userId }, { $set: { name: name.trim(), nameKey: keyOf(name) } }, { returnDocument: "after" }).lean();
    } catch (error) {
      throw isDuplicateKey(error) ? nameTaken() : error;
    }
    if (!doc) throw listNotFound();
    return { id: doc._id.toString(), name: doc.name, count: await WishlistItem.countDocuments({ user: userId, list: doc._id }), createdAt: doc.createdAt };
  }

  // Deleting a list either moves its products back to "Saved items" (the default) or removes them too.
  async deleteGroup(userId: string, listId: string, removeItems: boolean): Promise<void> {
    const doc = await WishlistList.findOneAndDelete({ _id: listId, user: userId }).lean();
    if (!doc) throw listNotFound();
    if (removeItems) await WishlistItem.deleteMany({ user: userId, list: doc._id });
    else await WishlistItem.updateMany({ user: userId, list: doc._id }, { $set: { list: null } });
  }

  private async ownList(userId: string, listId: string): Promise<void> {
    if (!(await WishlistList.exists({ _id: listId, user: userId }))) throw listNotFound();
  }
}
