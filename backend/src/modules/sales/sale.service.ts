import { randomBytes } from "node:crypto";
import { Types, trusted } from "mongoose";
import { HttpError } from "../../lib/http-error.js";
import { escapeRegex, skipOf, slugify, toPage, type Page } from "../../lib/pagination.js";
import type { AuditRecorder } from "../audit/audit.service.js";
import { Category } from "../categories/category.model.js";
import { Order } from "../orders/order.model.js";
import { Product, type IProduct, type IProductImage, type ProductStatus } from "../products/product.model.js";
import { Sale, type DiscountType, type ISale, type SaleScope, type SaleStatus } from "./sale.model.js";
import { checkSale, type AdminSalesQuery, type CreateSaleInput, type UpdateSaleInput } from "./sale.validation.js";

type SaleDoc = ISale & { _id: Types.ObjectId };

// Live sales are read on every catalogue and cart request, so they are cached in memory. Admin edits clear the cache at
// once on this instance; other API instances pick them up within this window.
const SALE_CACHE_MS = 30_000;
// A sale never takes a unit below ₹1, so a large fixed discount cannot make something free.
const MIN_SALE_PRICE = 100;
const UPCOMING_WINDOW_MS = 30 * 86_400_000;

// What the storefront shows next to a discounted price.
export interface SaleBadge {
  id: string;
  name: string;
  slug: string;
  label: string;
  endsAt: Date;
}

export interface SalePrice {
  price: number;
  // The variant's own price before any sale.
  listPrice: number;
  sale: SaleBadge | null;
}

export type PricedProduct = { _id: Types.ObjectId; categoryPath: readonly Types.ObjectId[] };

// Resolves the best live sale for one product at one list price. Built once per request from the cached sales.
export type Pricer = (product: PricedProduct, listPrice: number) => SalePrice;

export const NO_SALES: Pricer = (_product, listPrice) => ({ price: listPrice, listPrice, sale: null });

interface CachedSale {
  badge: SaleBadge;
  startsAt: number;
  endsAt: number;
  discountType: DiscountType;
  discountValue: number;
  appliesTo: SaleScope;
  categories: ReadonlySet<string>;
  products: ReadonlySet<string>;
}

export interface PublicSale {
  id: string;
  name: string;
  slug: string;
  description: string;
  label: string;
  discountType: DiscountType;
  discountValue: number;
  appliesTo: SaleScope;
  categories: { name: string; slug: string }[];
  startsAt: Date;
  endsAt: Date;
  status: SaleStatus;
}

export interface AdminSaleSummary {
  id: string;
  name: string;
  slug: string;
  description: string;
  label: string;
  discountType: DiscountType;
  discountValue: number;
  appliesTo: SaleScope;
  categoryIds: string[];
  productIds: string[];
  startsAt: Date;
  endsAt: Date;
  isActive: boolean;
  status: SaleStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface SaleStats {
  orders: number;
  units: number;
  revenue: number;
  discountGiven: number;
}

export interface AdminSale extends AdminSaleSummary {
  categories: { id: string; name: string; slug: string }[];
  products: { id: string; title: string; slug: string; image: IProductImage | null; minPrice: number; maxPrice: number; status: ProductStatus }[];
  stats: SaleStats;
}

const notFound = (): HttpError => new HttpError(404, "NOT_FOUND", "Sale not found");

const rupees = (paise: number): string => `₹${(paise / 100).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

export const saleLabel = (type: DiscountType, value: number): string => (type === "percent" ? `${value}% off` : `${rupees(value)} off`);

export function salePrice(listPrice: number, type: DiscountType, value: number): number {
  const off = type === "percent" ? Math.round((listPrice * value) / 100) : value;
  return Math.max(listPrice - off, Math.min(listPrice, MIN_SALE_PRICE));
}

export function statusOf(sale: Pick<ISale, "isActive" | "startsAt" | "endsAt">, now = new Date()): SaleStatus {
  if (!sale.isActive) return "disabled";
  if (sale.endsAt.getTime() <= now.getTime()) return "ended";
  return sale.startsAt.getTime() > now.getTime() ? "scheduled" : "live";
}

const toSummary = (doc: SaleDoc, now = new Date()): AdminSaleSummary => ({
  id: doc._id.toString(),
  name: doc.name,
  slug: doc.slug,
  description: doc.description,
  label: saleLabel(doc.discountType, doc.discountValue),
  discountType: doc.discountType,
  discountValue: doc.discountValue,
  appliesTo: doc.appliesTo,
  categoryIds: doc.categories.map((id) => id.toString()),
  productIds: doc.products.map((id) => id.toString()),
  startsAt: doc.startsAt,
  endsAt: doc.endsAt,
  isActive: doc.isActive,
  status: statusOf(doc, now),
  createdAt: doc.createdAt,
  updatedAt: doc.updatedAt,
});

const isDuplicateKey = (error: unknown): boolean => typeof error === "object" && error !== null && "code" in error && error.code === 11000;

const matchesNothing = (): Record<string, unknown> => ({ _id: trusted({ $in: [] }) });

export class SaleService {
  private cache: { loadedAt: number; sales: CachedSale[] } | null = null;
  private loading: Promise<CachedSale[]> | null = null;
  // Bumped on every admin write so a load that started before the write never repopulates the cache with stale sales.
  private generation = 0;

  constructor(private readonly audit: AuditRecorder) {}

  // ---- Pricing (catalogue, cart, checkout) ----

  async pricer(now = new Date()): Promise<Pricer> {
    const live = (await this.cached()).filter((sale) => sale.startsAt <= now.getTime() && sale.endsAt > now.getTime());
    if (live.length === 0) return NO_SALES;
    return (product, listPrice) => {
      let best: SalePrice = { price: listPrice, listPrice, sale: null };
      for (const sale of live) {
        if (!appliesTo(sale, product)) continue;
        const price = salePrice(listPrice, sale.discountType, sale.discountValue);
        // The cheapest price wins; on a tie, the sale that ends first (the more urgent message).
        if (price < best.price || (best.sale && price === best.price && sale.endsAt < best.sale.endsAt.getTime())) best = { price, listPrice, sale: sale.badge };
      }
      return best;
    };
  }

  // A product filter for "this sale" (slug) or "any live sale", to combine with the rest of the listing filter.
  async listingFilter(slug: string | undefined, now = new Date()): Promise<Record<string, unknown>> {
    const live = (await this.cached()).filter((sale) => sale.startsAt <= now.getTime() && sale.endsAt > now.getTime() && (!slug || sale.badge.slug === slug));
    if (live.length === 0) return matchesNothing();
    if (live.some((sale) => sale.appliesTo === "all")) return {};
    const categories = [...new Set(live.flatMap((sale) => (sale.appliesTo === "categories" ? [...sale.categories] : [])))];
    const products = [...new Set(live.flatMap((sale) => (sale.appliesTo === "products" ? [...sale.products] : [])))];
    const clauses = [
      ...(categories.length ? [{ categoryPath: trusted({ $in: categories.map((id) => new Types.ObjectId(id)) }) }] : []),
      ...(products.length ? [{ _id: trusted({ $in: products.map((id) => new Types.ObjectId(id)) }) }] : []),
    ];
    return clauses.length === 1 ? (clauses[0] as Record<string, unknown>) : { $or: clauses };
  }

  invalidate(): void {
    this.generation += 1;
    this.cache = null;
    this.loading = null;
  }

  // ---- Storefront ----

  async listPublic(now = new Date()): Promise<{ live: PublicSale[]; upcoming: PublicSale[] }> {
    const docs = await Sale.find({ isActive: true, endsAt: trusted({ $gt: now }), startsAt: trusted({ $lte: new Date(now.getTime() + UPCOMING_WINDOW_MS) }) })
      .sort({ endsAt: 1 })
      .limit(50)
      .lean<SaleDoc[]>();
    const sales = await this.toPublic(docs, now);
    return { live: sales.filter((sale) => sale.status === "live"), upcoming: sales.filter((sale) => sale.status === "scheduled").sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime()) };
  }

  // Ended sales are still answered (with their status) so an old link can say "this sale has ended" instead of 404.
  async getPublic(slug: string, now = new Date()): Promise<PublicSale> {
    const doc = await Sale.findOne({ slug, isActive: true }).lean<SaleDoc>();
    if (!doc) throw notFound();
    const [sale] = await this.toPublic([doc], now);
    if (!sale) throw notFound();
    return sale;
  }

  // ---- Admin ----

  async adminList(query: AdminSalesQuery, now = new Date()): Promise<Page<AdminSaleSummary>> {
    const filter: Record<string, unknown> = {};
    if (query.status === "disabled") filter.isActive = false;
    else if (query.status === "ended") Object.assign(filter, { isActive: true, endsAt: trusted({ $lte: now }) });
    else if (query.status === "scheduled") Object.assign(filter, { isActive: true, startsAt: trusted({ $gt: now }) });
    else if (query.status === "live") Object.assign(filter, { isActive: true, startsAt: trusted({ $lte: now }), endsAt: trusted({ $gt: now }) });
    if (query.q) {
      const pattern = new RegExp(escapeRegex(query.q), "i");
      filter.$or = [{ name: trusted({ $regex: pattern }) }, { slug: trusted({ $regex: pattern }) }];
    }
    const [docs, total] = await Promise.all([Sale.find(filter).sort({ startsAt: -1, _id: -1 }).skip(skipOf(query)).limit(query.limit).lean<SaleDoc[]>(), Sale.countDocuments(filter)]);
    return toPage(
      docs.map((doc) => toSummary(doc, now)),
      total,
      query,
    );
  }

  async adminGet(id: string): Promise<AdminSale> {
    const doc = await Sale.findById(id).lean<SaleDoc>();
    if (!doc) throw notFound();
    const [categories, products, stats] = await Promise.all([
      doc.categories.length ? Category.find({ _id: trusted({ $in: doc.categories }) }, { name: 1, slug: 1 }).lean() : [],
      doc.products.length ? Product.find({ _id: trusted({ $in: doc.products }) }, { title: 1, slug: 1, images: { $slice: 1 }, minPrice: 1, maxPrice: 1, status: 1 }).lean<(Pick<IProduct, "title" | "slug" | "images" | "minPrice" | "maxPrice" | "status"> & { _id: Types.ObjectId })[]>() : [],
      this.stats(doc._id),
    ]);
    return {
      ...toSummary(doc),
      categories: categories.map((category) => ({ id: category._id.toString(), name: category.name, slug: category.slug })),
      products: products.map((product) => ({
        id: product._id.toString(),
        title: product.title,
        slug: product.slug,
        image: product.images[0] ? { key: product.images[0].key, url: product.images[0].url, alt: product.images[0].alt } : null,
        minPrice: product.minPrice,
        maxPrice: product.maxPrice,
        status: product.status,
      })),
      stats,
    };
  }

  async create(input: CreateSaleInput, actorId: string): Promise<AdminSale> {
    await this.validate(input);
    const slug = input.slug ?? (await this.freeSlug(input.name));
    let doc;
    try {
      doc = await Sale.create({ ...this.fields(input), slug });
    } catch (error) {
      throw isDuplicateKey(error) ? slugTaken() : error;
    }
    this.invalidate();
    this.audit.record("sale_created", { scope: "admin", userId: actorId, meta: { saleId: doc._id.toString(), slug } });
    return this.adminGet(doc._id.toString());
  }

  async update(id: string, input: UpdateSaleInput, actorId: string): Promise<AdminSale> {
    const current = await Sale.findById(id).lean<SaleDoc>();
    if (!current) throw notFound();
    const merged: CreateSaleInput = {
      name: input.name ?? current.name,
      slug: input.slug ?? current.slug,
      description: input.description ?? current.description,
      discountType: input.discountType ?? current.discountType,
      discountValue: input.discountValue ?? current.discountValue,
      appliesTo: input.appliesTo ?? current.appliesTo,
      categoryIds: input.categoryIds ?? current.categories.map((value) => value.toString()),
      productIds: input.productIds ?? current.products.map((value) => value.toString()),
      startsAt: input.startsAt ?? current.startsAt,
      endsAt: input.endsAt ?? current.endsAt,
      isActive: input.isActive ?? current.isActive,
    };
    await this.validate(merged);
    try {
      await Sale.updateOne({ _id: current._id }, { $set: { ...this.fields(merged), slug: merged.slug } }, { runValidators: true });
    } catch (error) {
      throw isDuplicateKey(error) ? slugTaken() : error;
    }
    this.invalidate();
    this.audit.record("sale_updated", { scope: "admin", userId: actorId, meta: { saleId: id, fields: Object.keys(input) } });
    return this.adminGet(id);
  }

  // Orders keep their own snapshot of the sale, so deleting one never changes past orders.
  async remove(id: string, actorId: string): Promise<void> {
    const doc = await Sale.findByIdAndDelete(id).lean<SaleDoc>();
    if (!doc) throw notFound();
    this.invalidate();
    this.audit.record("sale_deleted", { scope: "admin", userId: actorId, meta: { saleId: id, slug: doc.slug } });
  }

  async stats(saleId: Types.ObjectId): Promise<SaleStats> {
    const [row] = await Order.aggregate<{ orders: number; units: number; revenue: number; discountGiven: number }>([
      { $match: { "items.sale.id": saleId.toString(), status: { $nin: ["pending_payment", "cancelled"] } } },
      { $unwind: "$items" },
      { $match: { "items.sale.id": saleId.toString() } },
      {
        $group: {
          _id: null,
          orderIds: { $addToSet: "$_id" },
          units: { $sum: "$items.quantity" },
          revenue: { $sum: "$items.lineTotal" },
          discountGiven: { $sum: { $multiply: [{ $subtract: ["$items.listPrice", "$items.unitPrice"] }, "$items.quantity"] } },
        },
      },
      { $project: { _id: 0, orders: { $size: "$orderIds" }, units: 1, revenue: 1, discountGiven: 1 } },
    ]);
    return row ?? { orders: 0, units: 0, revenue: 0, discountGiven: 0 };
  }

  // ---- Internals ----

  private async cached(): Promise<CachedSale[]> {
    if (this.cache && Date.now() - this.cache.loadedAt < SALE_CACHE_MS) return this.cache.sales;
    if (this.loading) return this.loading;
    const generation = this.generation;
    const loading = Sale.find({ isActive: true, endsAt: trusted({ $gt: new Date() }) })
      .lean<SaleDoc[]>()
      .then((docs) => {
        const sales = docs.map(toCached);
        if (generation === this.generation) this.cache = { loadedAt: Date.now(), sales };
        return sales;
      })
      .finally(() => {
        if (this.loading === loading) this.loading = null;
      });
    this.loading = loading;
    return loading;
  }

  private async toPublic(docs: readonly SaleDoc[], now: Date): Promise<PublicSale[]> {
    const categoryIds = [...new Set(docs.flatMap((doc) => doc.categories.map((id) => id.toString())))];
    const categories = categoryIds.length ? await Category.find({ _id: trusted({ $in: categoryIds.map((id) => new Types.ObjectId(id)) }), isActive: true }, { name: 1, slug: 1 }).lean() : [];
    const byId = new Map(categories.map((category) => [category._id.toString(), { name: category.name, slug: category.slug }]));
    return docs.map((doc) => ({
      id: doc._id.toString(),
      name: doc.name,
      slug: doc.slug,
      description: doc.description,
      label: saleLabel(doc.discountType, doc.discountValue),
      discountType: doc.discountType,
      discountValue: doc.discountValue,
      appliesTo: doc.appliesTo,
      categories: doc.categories.flatMap((id) => byId.get(id.toString()) ?? []),
      startsAt: doc.startsAt,
      endsAt: doc.endsAt,
      status: statusOf(doc, now),
    }));
  }

  private async validate(input: CreateSaleInput): Promise<void> {
    const issues = checkSale(input);
    if (input.appliesTo === "categories" && input.categoryIds.length) {
      const found = await Category.countDocuments({ _id: trusted({ $in: input.categoryIds.map((id) => new Types.ObjectId(id)) }) });
      if (found !== input.categoryIds.length) issues.push({ path: "categoryIds", message: "Some categories no longer exist" });
    }
    if (input.appliesTo === "products" && input.productIds.length) {
      const found = await Product.countDocuments({ _id: trusted({ $in: input.productIds.map((id) => new Types.ObjectId(id)) }) });
      if (found !== input.productIds.length) issues.push({ path: "productIds", message: "Some products no longer exist" });
    }
    if (issues.length) throw new HttpError(400, "VALIDATION_ERROR", "Request validation failed", issues);
  }

  // Only the list that matches the scope is stored, so switching scope never leaves a hidden list behind.
  private fields(input: CreateSaleInput): Omit<ISale, "slug" | "createdAt" | "updatedAt"> {
    return {
      name: input.name,
      description: input.description,
      discountType: input.discountType,
      discountValue: input.discountValue,
      appliesTo: input.appliesTo,
      categories: input.appliesTo === "categories" ? input.categoryIds.map((id) => new Types.ObjectId(id)) : [],
      products: input.appliesTo === "products" ? input.productIds.map((id) => new Types.ObjectId(id)) : [],
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      isActive: input.isActive,
    };
  }

  private async freeSlug(name: string): Promise<string> {
    const base = slugify(name) || "sale";
    if (!(await Sale.exists({ slug: base }))) return base;
    return `${base.slice(0, 90)}-${randomBytes(3).toString("hex")}`;
  }
}

const slugTaken = (): HttpError => new HttpError(409, "SLUG_TAKEN", "Another sale already uses that slug", [{ path: "slug", message: "Already in use" }]);

function toCached(doc: SaleDoc): CachedSale {
  return {
    badge: { id: doc._id.toString(), name: doc.name, slug: doc.slug, label: saleLabel(doc.discountType, doc.discountValue), endsAt: doc.endsAt },
    startsAt: doc.startsAt.getTime(),
    endsAt: doc.endsAt.getTime(),
    discountType: doc.discountType,
    discountValue: doc.discountValue,
    appliesTo: doc.appliesTo,
    categories: new Set(doc.categories.map((id) => id.toString())),
    products: new Set(doc.products.map((id) => id.toString())),
  };
}

function appliesTo(sale: CachedSale, product: PricedProduct): boolean {
  if (sale.appliesTo === "all") return true;
  if (sale.appliesTo === "products") return sale.products.has(product._id.toString());
  return product.categoryPath.some((id) => sale.categories.has(id.toString()));
}
