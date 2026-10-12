import { Schema, model, type Types } from "mongoose";
import { HttpError } from "../../lib/http-error.js";
import { Product } from "../products/product.model.js";
import { toProductCard, type ProductCard, type ProductService } from "../products/product.service.js";

export const MAX_WISHLIST_ITEMS = 200;

export interface IWishlistItem {
  user: Types.ObjectId;
  product: Types.ObjectId;
  createdAt: Date;
}

// One document per saved product: adding is an idempotent upsert and the unique index stops duplicates.
const wishlistItemSchema = new Schema<IWishlistItem>(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true },
    product: { type: Schema.Types.ObjectId, ref: "Product", required: true },
    createdAt: { type: Date, default: () => new Date() },
  },
  { versionKey: false },
);

wishlistItemSchema.index({ user: 1, product: 1 }, { unique: true });
wishlistItemSchema.index({ user: 1, createdAt: -1 });

export const WishlistItem = model<IWishlistItem>("WishlistItem", wishlistItemSchema);

export interface WishlistEntry {
  product: ProductCard;
  // False once the product is archived or unpublished; it stays listed so the customer sees what happened.
  available: boolean;
  addedAt: Date;
}

export class WishlistService {
  constructor(private readonly products: ProductService) {}

  async list(userId: string): Promise<WishlistEntry[]> {
    const items = await WishlistItem.find({ user: userId }).sort({ createdAt: -1 }).limit(MAX_WISHLIST_ITEMS).lean();
    const products = await this.products.cardsByIds(items.map((item) => item.product));
    return items.flatMap((item) => {
      const product = products.get(item.product.toString());
      // A hard-deleted product simply drops out.
      return product ? [{ product: toProductCard(product), available: product.status === "active", addedAt: item.createdAt }] : [];
    });
  }

  // Just the ids, so listing pages can draw filled hearts without loading the whole wishlist.
  async ids(userId: string): Promise<string[]> {
    const items = await WishlistItem.find({ user: userId }, { product: 1 }).limit(MAX_WISHLIST_ITEMS).lean();
    return items.map((item) => item.product.toString());
  }

  async add(userId: string, productId: string): Promise<void> {
    if (!(await Product.exists({ _id: productId, status: "active" }))) throw new HttpError(404, "NOT_FOUND", "Product not found");
    if (await WishlistItem.exists({ user: userId, product: productId })) return;
    if ((await WishlistItem.countDocuments({ user: userId })) >= MAX_WISHLIST_ITEMS) throw new HttpError(422, "WISHLIST_FULL", `A wishlist holds at most ${MAX_WISHLIST_ITEMS} products`);
    await WishlistItem.updateOne({ user: userId, product: productId }, { $setOnInsert: { createdAt: new Date() } }, { upsert: true });
  }

  async remove(userId: string, productId: string): Promise<void> {
    await WishlistItem.deleteOne({ user: userId, product: productId });
  }
}
