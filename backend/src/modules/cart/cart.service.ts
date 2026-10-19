import { Types } from "mongoose";
import { HttpError } from "../../lib/http-error.js";
import type { IProductImage, IVariant } from "../products/product.model.js";
import { MAX_VISIBLE_STOCK, wasPrice, type ProductDoc, type ProductService } from "../products/product.service.js";
import type { SaleBadge, SalePrice } from "../sales/sale.service.js";
import { Cart, MAX_CART_LINES, MAX_LINE_QUANTITY, type ICartItem } from "./cart.model.js";
import type { AddCartItemInput } from "./cart.validation.js";

export type CartLineStatus = "ok" | "unavailable" | "insufficient_stock";

export interface CartLine {
  productId: string;
  slug: string;
  title: string;
  brand: string;
  image: IProductImage | null;
  sku: string;
  options: Record<string, string>;
  // After any live sale.
  unitPrice: number;
  compareAtPrice: number | null;
  sale: SaleBadge | null;
  quantity: number;
  lineTotal: number;
  available: number;
  status: CartLineStatus;
}

export interface CartView {
  lines: CartLine[];
  itemCount: number;
  // Only lines that can be bought right now.
  subtotal: number;
  // True when some line must be fixed (removed or reduced) before checkout.
  hasIssues: boolean;
}

// A line resolved against the live product, as both the cart view and checkout need it.
export interface PricedLine {
  item: ICartItem;
  product: ProductDoc | undefined;
  variant: IVariant | undefined;
  // The unit price right now (with any live sale); undefined when the product or variant is gone.
  priced: SalePrice | undefined;
  status: CartLineStatus;
}

export const EMPTY_CART: CartView = { lines: [], itemCount: 0, subtotal: 0, hasIssues: false };

const productUnavailable = (): HttpError => new HttpError(409, "PRODUCT_UNAVAILABLE", "This product is no longer available");

const insufficientStock = (available: number): HttpError =>
  new HttpError(409, "INSUFFICIENT_STOCK", available > 0 ? `Only ${available} left in stock` : "This item is out of stock", [{ path: "quantity", message: `Available: ${available}` }]);

export class CartService {
  constructor(private readonly products: ProductService) {}

  async get(userId: string): Promise<CartView> {
    const cart = await Cart.findOne({ user: userId }).lean();
    return cart ? this.view(cart.items) : EMPTY_CART;
  }

  // Resolves every line against the current product: price, availability and stock are never taken from the cart.
  async price(items: readonly ICartItem[]): Promise<PricedLine[]> {
    const [products, pricer] = await Promise.all([this.products.cardsByIds([...new Set(items.map((item) => item.product.toString()))].map((id) => new Types.ObjectId(id))), this.products.pricer()]);
    return items.map((item) => {
      const product = products.get(item.product.toString());
      const variant = product?.variants.find((candidate) => candidate.sku === item.sku);
      const status: CartLineStatus = !product || product.status !== "active" || !variant || !variant.isActive ? "unavailable" : variant.stock < item.quantity ? "insufficient_stock" : "ok";
      return { item, product, variant, priced: product && variant ? pricer(product, variant.price) : undefined, status };
    });
  }

  async add(userId: string, input: AddCartItemInput): Promise<CartView> {
    const items = await this.items(userId);
    const variant = await this.purchasableVariant(input.productId, input.sku);
    const existing = items.find((item) => item.sku === input.sku);
    const quantity = (existing?.quantity ?? 0) + input.quantity;
    if (quantity > MAX_LINE_QUANTITY) throw new HttpError(422, "QUANTITY_LIMIT", `At most ${MAX_LINE_QUANTITY} of an item per order`);
    if (quantity > variant.stock) throw insufficientStock(Math.min(variant.stock, MAX_VISIBLE_STOCK));

    if (existing) existing.quantity = quantity;
    else {
      if (items.length >= MAX_CART_LINES) throw new HttpError(422, "CART_FULL", `A cart holds at most ${MAX_CART_LINES} different items`);
      items.push({ product: new Types.ObjectId(input.productId), sku: input.sku, quantity, addedAt: new Date() });
    }
    return this.save(userId, items);
  }

  async setQuantity(userId: string, sku: string, quantity: number): Promise<CartView> {
    const items = await this.items(userId);
    const line = items.find((item) => item.sku === sku);
    if (!line) throw new HttpError(404, "NOT_FOUND", "That item is not in your cart");
    if (quantity === 0) return this.save(userId, items.filter((item) => item !== line));
    // Lowering a quantity is always allowed (it is how a customer fixes an "insufficient stock" line).
    if (quantity > line.quantity) {
      const variant = await this.purchasableVariant(line.product.toString(), sku);
      if (quantity > variant.stock) throw insufficientStock(Math.min(variant.stock, MAX_VISIBLE_STOCK));
    }
    line.quantity = quantity;
    return this.save(userId, items);
  }

  async remove(userId: string, sku: string): Promise<CartView> {
    const items = await this.items(userId);
    return this.save(userId, items.filter((item) => item.sku !== sku));
  }

  async clear(userId: string): Promise<void> {
    await Cart.updateOne({ user: userId }, { $set: { items: [] } });
  }

  // Best effort: lines that no longer exist or are out of stock are dropped, and quantities are capped by stock and the
  // per-line limit, so signing in never fails because of a stale guest cart.
  async merge(userId: string, incoming: readonly AddCartItemInput[]): Promise<CartView> {
    const items = await this.items(userId);
    const candidates = incoming.map((line) => ({ product: new Types.ObjectId(line.productId), sku: line.sku, quantity: line.quantity, addedAt: new Date() }));
    const priced = await this.price(candidates);
    for (const { item, variant, status } of priced) {
      if (status === "unavailable" || !variant) continue;
      const existing = items.find((current) => current.sku === item.sku);
      const quantity = Math.min((existing?.quantity ?? 0) + item.quantity, MAX_LINE_QUANTITY, variant.stock);
      if (quantity <= 0) continue;
      if (existing) existing.quantity = Math.max(existing.quantity, quantity);
      else if (items.length < MAX_CART_LINES) items.push({ ...item, quantity });
    }
    return this.save(userId, items);
  }

  private async items(userId: string): Promise<ICartItem[]> {
    const cart = await Cart.findOne({ user: userId }).lean();
    return cart?.items.map((item) => ({ ...item })) ?? [];
  }

  private async save(userId: string, items: ICartItem[]): Promise<CartView> {
    const cart = await Cart.findOneAndUpdate({ user: userId }, { $set: { items } }, { upsert: true, returnDocument: "after", runValidators: true }).lean();
    return this.view(cart?.items ?? []);
  }

  private async purchasableVariant(productId: string, sku: string): Promise<IVariant> {
    const [line] = await this.price([{ product: new Types.ObjectId(productId), sku, quantity: 1, addedAt: new Date() }]);
    if (!line?.variant || line.status === "unavailable") throw productUnavailable();
    return line.variant;
  }

  private async view(items: readonly ICartItem[]): Promise<CartView> {
    if (items.length === 0) return EMPTY_CART;
    const priced = await this.price(items);
    const lines: CartLine[] = priced.map(({ item, product, variant, priced: price, status }) => ({
      productId: item.product.toString(),
      slug: product?.slug ?? "",
      title: product?.title ?? "Unavailable product",
      brand: product?.brand ?? "",
      image: product?.images[0] ? { key: product.images[0].key, url: product.images[0].url, alt: product.images[0].alt } : null,
      sku: item.sku,
      options: variant?.options ?? {},
      unitPrice: price?.price ?? 0,
      compareAtPrice: variant && price ? wasPrice(variant, price) : null,
      sale: price?.sale ?? null,
      quantity: item.quantity,
      lineTotal: (price?.price ?? 0) * item.quantity,
      available: status === "unavailable" ? 0 : Math.min(variant?.stock ?? 0, MAX_VISIBLE_STOCK),
      status,
    }));
    const purchasable = lines.filter((line) => line.status === "ok");
    return {
      lines,
      itemCount: lines.reduce((sum, line) => sum + line.quantity, 0),
      subtotal: purchasable.reduce((sum, line) => sum + line.lineTotal, 0),
      hasIssues: purchasable.length !== lines.length,
    };
  }
}
