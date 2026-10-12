import { randomBytes } from "node:crypto";
import { Types, trusted, type PipelineStage } from "mongoose";
import { ZodError } from "zod";
import { HttpError } from "../../lib/http-error.js";
import { escapeRegex, skipOf, slugify, toPage, type Page, type Pagination } from "../../lib/pagination.js";
import type { AuditRecorder } from "../audit/audit.service.js";
import { Category } from "../categories/category.model.js";
import { attributeValuesSchema, variantOptionsSchema, type CategoryService } from "../categories/category.service.js";
import type { AttributeDef } from "../categories/category.validation.js";
import type { UploadService } from "../uploads/upload.service.js";
import { Product, type AttributeValue, type IProduct, type IProductImage, type IVariant, type ProductStatus } from "./product.model.js";
import type { CreateProductInput, ProductListQuery, SetStockInput, UpdateProductInput, VariantInput } from "./product.validation.js";

export type ProductDoc = IProduct & { _id: Types.ObjectId; createdAt: Date; updatedAt: Date };

// The storefront shows "only N left" below this, and the admin "low stock" filter uses it too.
export const LOW_STOCK_THRESHOLD = 5;
// Customers never see exact stock above this: it is also the most one cart line can hold.
export const MAX_VISIBLE_STOCK = 10;

export interface PublicVariant {
  sku: string;
  options: Record<string, string>;
  price: number;
  compareAtPrice: number | null;
  inStock: boolean;
  available: number;
}

export interface ProductCard {
  id: string;
  title: string;
  slug: string;
  brand: string;
  image: IProductImage | null;
  minPrice: number;
  maxPrice: number;
  compareAtPrice: number | null;
  inStock: boolean;
  isFeatured: boolean;
}

export interface PublicProduct extends Omit<ProductCard, "image"> {
  description: string;
  category: { id: string; name: string; slug: string };
  breadcrumbs: { name: string; slug: string }[];
  attributes: Record<string, AttributeValue>;
  // Effective attribute definitions of the category, so the page can label specs and build the variant picker.
  attributeDefs: AttributeDef[];
  variants: PublicVariant[];
  images: IProductImage[];
  tags: string[];
}

export interface AdminProduct {
  id: string;
  title: string;
  slug: string;
  description: string;
  brand: string;
  categoryId: string;
  attributes: Record<string, AttributeValue>;
  variants: IVariant[];
  images: IProductImage[];
  tags: string[];
  status: ProductStatus;
  isFeatured: boolean;
  minPrice: number;
  maxPrice: number;
  totalStock: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface FacetGroup {
  key: string;
  label: string;
  values: { value: string; count: number }[];
}

export interface FacetResult {
  facets: FacetGroup[];
  price: { min: number; max: number } | null;
}

const notFound = (): HttpError => new HttpError(404, "NOT_FOUND", "Product not found");

const toAdminProduct = (doc: ProductDoc): AdminProduct => ({
  id: doc._id.toString(),
  title: doc.title,
  slug: doc.slug,
  description: doc.description,
  brand: doc.brand,
  categoryId: doc.category.toString(),
  attributes: doc.attributes,
  variants: doc.variants.map((variant) => ({ sku: variant.sku, options: variant.options, price: variant.price, compareAtPrice: variant.compareAtPrice ?? null, stock: variant.stock, isActive: variant.isActive })),
  images: doc.images.map((image) => ({ key: image.key, url: image.url, alt: image.alt })),
  tags: doc.tags,
  status: doc.status,
  isFeatured: doc.isFeatured,
  minPrice: doc.minPrice,
  maxPrice: doc.maxPrice,
  totalStock: doc.totalStock,
  createdAt: doc.createdAt,
  updatedAt: doc.updatedAt,
});

const activeVariants = (doc: Pick<IProduct, "variants">): IVariant[] => doc.variants.filter((variant) => variant.isActive);

export const toPublicVariant = (variant: IVariant): PublicVariant => ({
  sku: variant.sku,
  options: variant.options,
  price: variant.price,
  compareAtPrice: variant.compareAtPrice ?? null,
  inStock: variant.stock > 0,
  available: Math.min(variant.stock, MAX_VISIBLE_STOCK),
});

export const toProductCard = (doc: ProductDoc): ProductCard => {
  const cheapest = activeVariants(doc).reduce<IVariant | undefined>((best, variant) => (!best || variant.price < best.price ? variant : best), undefined);
  return {
    id: doc._id.toString(),
    title: doc.title,
    slug: doc.slug,
    brand: doc.brand,
    image: doc.images[0] ? { key: doc.images[0].key, url: doc.images[0].url, alt: doc.images[0].alt } : null,
    minPrice: doc.minPrice,
    maxPrice: doc.maxPrice,
    compareAtPrice: cheapest?.compareAtPrice ?? null,
    inStock: doc.totalStock > 0,
    isFeatured: doc.isFeatured,
  };
};

const CARD_PROJECTION = { title: 1, slug: 1, brand: 1, images: { $slice: 1 }, minPrice: 1, maxPrice: 1, totalStock: 1, isFeatured: 1, "variants.price": 1, "variants.compareAtPrice": 1, "variants.isActive": 1 } as const;

const isDuplicateKey = (error: unknown): error is { keyPattern?: Record<string, unknown> } => typeof error === "object" && error !== null && "code" in error && error.code === 11000;

// Turns a Zod failure on the category-specific attribute schema into the same 400 shape as every other validation error.
const prefixed = (error: ZodError, prefix: string): HttpError =>
  new HttpError(400, "VALIDATION_ERROR", "Request validation failed", error.issues.map((issue) => ({ path: [prefix, ...issue.path].join("."), message: issue.message })));

export interface ProductServiceDeps {
  categories: CategoryService;
  uploads: UploadService;
  audit: AuditRecorder;
}

export class ProductService {
  private readonly categories: CategoryService;
  private readonly uploads: UploadService;
  private readonly audit: AuditRecorder;

  constructor(deps: ProductServiceDeps) {
    this.categories = deps.categories;
    this.uploads = deps.uploads;
    this.audit = deps.audit;
  }

  // ---- Storefront ----

  async list(query: ProductListQuery): Promise<Page<ProductCard>> {
    const filter = await this.publicFilter(query);
    const sort: Record<string, 1 | -1 | { $meta: "textScore" }> =
      query.sort === "price_asc" ? { minPrice: 1, _id: 1 } : query.sort === "price_desc" ? { maxPrice: -1, _id: -1 } : query.sort === "relevance" && query.q ? { score: { $meta: "textScore" }, _id: -1 } : { createdAt: -1, _id: -1 };
    const projection = query.q ? { ...CARD_PROJECTION, score: { $meta: "textScore" } } : CARD_PROJECTION;
    const [docs, total] = await Promise.all([
      Product.find(filter, projection).sort(sort).skip(skipOf(query)).limit(query.limit).lean<ProductDoc[]>(),
      Product.countDocuments(filter),
    ]);
    return toPage(docs.map(toProductCard), total, query);
  }

  // Counts per filter value. Each selected filter's own counts ignore that filter, so picking "Red" still shows how many
  // "Blue" products there are instead of collapsing the list to one option.
  async facets(query: ProductListQuery): Promise<FacetResult> {
    const base = await this.publicFilter({ ...query, facets: new Map() });
    const facetMatch = (except?: string): Record<string, unknown> => {
      const clauses = [...query.facets].filter(([key]) => key !== except).map(([key, values]) => ({ facets: { $in: values.map((value) => `${key}:${value}`) } }));
      return clauses.length ? { $and: clauses } : {};
    };
    const count = (match: Record<string, unknown>, key?: string): PipelineStage.FacetPipelineStage[] => [
      { $match: match },
      { $unwind: "$facets" },
      ...(key ? [{ $match: { facets: { $regex: `^${escapeRegex(key)}:` } } }] : []),
      { $group: { _id: "$facets", count: { $sum: 1 } } },
      { $limit: 1000 },
    ];
    const selected = [...query.facets.keys()];
    const stages: Record<string, PipelineStage.FacetPipelineStage[]> = {
      price: [{ $match: facetMatch() }, { $group: { _id: null, min: { $min: "$minPrice" }, max: { $max: "$maxPrice" } } }],
      all: count(facetMatch()),
    };
    selected.forEach((key, index) => (stages[`s${index}`] = count(facetMatch(key), key)));

    const [result] = await Product.aggregate<Record<string, { _id: string | null; count?: number; min?: number; max?: number }[]>>([{ $match: base }, { $facet: stages }]);
    const counts = new Map<string, Map<string, number>>();
    const collect = (rows: { _id: string | null; count?: number }[] | undefined, only?: string): void => {
      for (const row of rows ?? []) {
        if (!row._id) continue;
        const split = row._id.indexOf(":");
        const key = row._id.slice(0, split);
        if (only ? key !== only : selected.includes(key)) continue;
        if (!counts.has(key)) counts.set(key, new Map());
        counts.get(key)?.set(row._id.slice(split + 1), row.count ?? 0);
      }
    };
    collect(result?.all);
    selected.forEach((key, index) => collect(result?.[`s${index}`], key));

    const defs = await this.labelDefs(query.category);
    const groups: FacetGroup[] = [];
    const ordered = ["brand", ...defs.keys()].filter((key) => counts.has(key));
    for (const key of ordered) {
      const values = counts.get(key) ?? new Map<string, number>();
      const options = defs.get(key)?.options ?? [];
      const rank = (value: string) => (options.indexOf(value) === -1 ? Number.MAX_SAFE_INTEGER : options.indexOf(value));
      groups.push({
        key,
        label: key === "brand" ? "Brand" : (defs.get(key)?.label ?? key),
        values: [...values].map(([value, n]) => ({ value, count: n })).sort((a, b) => rank(a.value) - rank(b.value) || b.count - a.count || a.value.localeCompare(b.value)),
      });
    }
    const price = result?.price?.[0];
    return { facets: groups, price: price && typeof price.min === "number" && typeof price.max === "number" ? { min: price.min, max: price.max } : null };
  }

  async getActiveBySlug(slug: string): Promise<PublicProduct> {
    const doc = await Product.findOne({ slug, status: "active" }).lean<ProductDoc>();
    if (!doc) throw notFound();
    const category = await this.categories.getById(doc.category.toString()).catch(() => null);
    if (!category) throw notFound();
    const card = toProductCard(doc);
    return {
      ...card,
      description: doc.description,
      category: { id: category.id, name: category.name, slug: category.slug },
      breadcrumbs: category.breadcrumbs,
      attributes: doc.attributes,
      attributeDefs: category.effectiveAttributes,
      variants: activeVariants(doc).map(toPublicVariant),
      images: doc.images.map((image) => ({ key: image.key, url: image.url, alt: image.alt })),
      tags: doc.tags,
    };
  }

  async cardsByIds(ids: readonly Types.ObjectId[], options: { activeOnly?: boolean } = {}): Promise<Map<string, ProductDoc>> {
    if (ids.length === 0) return new Map();
    const docs = await Product.find({ _id: trusted({ $in: [...ids] }), ...(options.activeOnly ? { status: "active" } : {}) }).lean<ProductDoc[]>();
    return new Map(docs.map((doc) => [doc._id.toString(), doc]));
  }

  // ---- Admin ----

  async adminList(query: Pagination & { q?: string; status?: ProductStatus; categoryId?: string; lowStock?: "true" | "false" }): Promise<Page<AdminProduct>> {
    const filter: Record<string, unknown> = {};
    if (query.status) filter.status = query.status;
    if (query.categoryId) filter.categoryPath = new Types.ObjectId(query.categoryId);
    if (query.lowStock === "true") filter.variants = trusted({ $elemMatch: { isActive: true, stock: { $lte: LOW_STOCK_THRESHOLD } } });
    if (query.q) {
      const pattern = new RegExp(escapeRegex(query.q), "i");
      filter.$or = [{ title: trusted({ $regex: pattern }) }, { slug: trusted({ $regex: pattern }) }, { brand: trusted({ $regex: pattern }) }, { "variants.sku": trusted({ $regex: new RegExp(escapeRegex(query.q.toUpperCase())) }) }];
    }
    const [docs, total] = await Promise.all([Product.find(filter).sort({ updatedAt: -1, _id: -1 }).skip(skipOf(query)).limit(query.limit).lean<ProductDoc[]>(), Product.countDocuments(filter)]);
    return toPage(docs.map(toAdminProduct), total, query);
  }

  async adminGet(id: string): Promise<AdminProduct> {
    const doc = await Product.findById(id).lean<ProductDoc>();
    if (!doc) throw notFound();
    return toAdminProduct(doc);
  }

  async create(input: CreateProductInput, actorId: string): Promise<AdminProduct> {
    const fields = await this.prepare(input);
    const images = await this.attachImages(input.images);
    const slug = input.slug ?? (await this.freeSlug(input.title));
    try {
      const doc = await Product.create({ ...fields, slug, title: input.title, description: input.description, brand: input.brand, tags: input.tags, status: input.status, isFeatured: input.isFeatured, images });
      this.audit.record("product_created", { scope: "admin", userId: actorId, meta: { productId: doc._id.toString(), slug } });
      return toAdminProduct(doc.toObject() as ProductDoc);
    } catch (error) {
      // The images were claimed for this product; release them so the admin can retry with the same uploads.
      await this.releaseImages(images.map((image) => image.key));
      throw this.conflict(error);
    }
  }

  async update(id: string, input: UpdateProductInput, actorId: string): Promise<AdminProduct> {
    const current = await Product.findById(id).lean<ProductDoc>();
    if (!current) throw notFound();

    // Stock of an existing SKU is owned by checkouts and the stock endpoint: a product edit (made from a form loaded
    // minutes ago) keeps the live count, and only brand-new SKUs take the stock from the edit.
    const liveStock = new Map(current.variants.map((variant) => [variant.sku, variant.stock]));
    const merged: CreateProductInput = {
      title: input.title ?? current.title,
      slug: input.slug ?? current.slug,
      description: input.description ?? current.description,
      brand: input.brand ?? current.brand,
      categoryId: input.categoryId ?? current.category.toString(),
      attributes: input.attributes ?? current.attributes,
      variants: (input.variants ?? current.variants).map((variant) => ({ ...variant, compareAtPrice: variant.compareAtPrice ?? null, stock: liveStock.get(variant.sku) ?? variant.stock })),
      images: input.images ?? current.images.map((image) => ({ key: image.key, alt: image.alt })),
      tags: input.tags ?? current.tags,
      status: input.status ?? current.status,
      isFeatured: input.isFeatured ?? current.isFeatured,
    };
    const fields = await this.prepare(merged);
    const existingKeys = new Set(current.images.map((image) => image.key));
    const images = input.images ? await this.attachImages(input.images, existingKeys) : current.images;

    // Optimistic concurrency: if a checkout reserved stock between the read above and this write, the write is refused
    // rather than putting the old stock back.
    let updated: ProductDoc | null;
    try {
      updated = await Product.findOneAndUpdate(
        { _id: current._id, updatedAt: current.updatedAt },
        { $set: { ...fields, slug: merged.slug, title: merged.title, description: merged.description, brand: merged.brand, tags: merged.tags, status: merged.status, isFeatured: merged.isFeatured, images } },
        { returnDocument: "after", runValidators: true },
      ).lean<ProductDoc>();
    } catch (error) {
      await this.releaseImages(images.filter((image) => !existingKeys.has(image.key)).map((image) => image.key));
      throw this.conflict(error);
    }
    if (!updated) {
      await this.releaseImages(images.filter((image) => !existingKeys.has(image.key)).map((image) => image.key));
      throw new HttpError(409, "EDIT_CONFLICT", "This product changed while you were editing it (for example an order reserved stock). Reload and try again.");
    }

    const kept = new Set(updated.images.map((image) => image.key));
    await this.uploads.remove(current.images.map((image) => image.key).filter((key) => !kept.has(key)));
    this.audit.record("product_updated", { scope: "admin", userId: actorId, meta: { productId: id, fields: Object.keys(input) } });
    return toAdminProduct(updated);
  }

  async setStatus(id: string, status: ProductStatus, actorId: string): Promise<AdminProduct> {
    const doc = await Product.findByIdAndUpdate(id, { $set: { status } }, { returnDocument: "after" }).lean<ProductDoc>();
    if (!doc) throw notFound();
    this.audit.record("product_updated", { scope: "admin", userId: actorId, meta: { productId: id, status } });
    return toAdminProduct(doc);
  }

  async setStock(id: string, sku: string, input: SetStockInput, actorId: string): Promise<AdminProduct> {
    const normalizedSku = sku.toUpperCase();
    let result;
    if ("stock" in input) {
      result = await Product.updateOne({ _id: id, "variants.sku": normalizedSku }, { $set: { "variants.$.stock": input.stock } });
    } else {
      // A negative adjustment can never take stock below zero, even if an order reserved some in the meantime.
      const elem = input.delta < 0 ? { sku: normalizedSku, stock: { $gte: -input.delta } } : { sku: normalizedSku };
      result = await Product.updateOne({ _id: id, variants: trusted({ $elemMatch: elem }) }, { $inc: { "variants.$.stock": input.delta } });
    }
    if (result.matchedCount === 0) {
      if (!(await Product.exists({ _id: id, "variants.sku": normalizedSku }))) throw new HttpError(404, "NOT_FOUND", "Variant not found");
      throw new HttpError(409, "INSUFFICIENT_STOCK", "Stock cannot go below zero");
    }
    await recomputeStock(id);
    this.audit.record("product_stock_changed", { scope: "admin", userId: actorId, meta: { productId: id, sku: normalizedSku, ...input } });
    return this.adminGet(id);
  }

  async remove(id: string, actorId: string, hasOrders: (productId: string) => Promise<boolean>): Promise<{ archived: boolean }> {
    const doc = await Product.findById(id).lean<ProductDoc>();
    if (!doc) throw notFound();
    // Past orders keep pointing at the product (and its images), so an ordered product is archived instead of deleted.
    if (await hasOrders(id)) {
      await Product.updateOne({ _id: doc._id }, { $set: { status: "archived" } });
      this.audit.record("product_updated", { scope: "admin", userId: actorId, meta: { productId: id, status: "archived" } });
      return { archived: true };
    }
    await Product.deleteOne({ _id: doc._id });
    await this.uploads.remove(doc.images.map((image) => image.key));
    this.audit.record("product_deleted", { scope: "admin", userId: actorId, meta: { productId: id, slug: doc.slug } });
    return { archived: false };
  }

  // ---- Internals ----

  private async publicFilter(query: Pick<ProductListQuery, "q" | "category" | "minPrice" | "maxPrice" | "inStock" | "featured" | "facets">): Promise<Record<string, unknown>> {
    const filter: Record<string, unknown> = { status: "active" };
    if (query.category) {
      const category = await this.categories.getActiveBySlug(query.category);
      filter.categoryPath = new Types.ObjectId(category.id);
    }
    if (query.q) filter.$text = trusted({ $search: query.q });
    if (query.minPrice !== undefined || query.maxPrice !== undefined) {
      filter.minPrice = trusted({ ...(query.minPrice !== undefined ? { $gte: query.minPrice } : {}), ...(query.maxPrice !== undefined ? { $lte: query.maxPrice } : {}) });
    }
    if (query.inStock) filter.totalStock = trusted({ $gt: 0 });
    if (query.featured) filter.isFeatured = true;
    if (query.facets.size) filter.$and = [...query.facets].map(([key, values]) => ({ facets: trusted({ $in: values.map((value) => `${key}:${value}`) }) }));
    return filter;
  }

  // Labels and option order for facet keys: the category's effective attributes, or every category's when unfiltered.
  private async labelDefs(categorySlug: string | undefined): Promise<Map<string, AttributeDef>> {
    if (categorySlug) {
      const category = await this.categories.getActiveBySlug(categorySlug);
      return new Map(category.effectiveAttributes.filter((def) => def.filterable).map((def) => [def.key, def]));
    }
    const all = await Category.find({ isActive: true }, { attributes: 1 }).lean();
    const defs = new Map<string, AttributeDef>();
    for (const category of all) for (const def of category.attributes) if (def.filterable && !defs.has(def.key)) defs.set(def.key, def);
    return defs;
  }

  // Validates the category-dependent parts and computes every denormalised field.
  private async prepare(input: CreateProductInput): Promise<Pick<IProduct, "category" | "categoryPath" | "attributes" | "variants" | "minPrice" | "maxPrice" | "totalStock" | "facets">> {
    const { category, attributes: defs } = await this.categories.effectiveAttributes(input.categoryId);

    const attributesResult = attributeValuesSchema(defs).safeParse(input.attributes);
    if (!attributesResult.success) throw prefixed(attributesResult.error, "attributes");
    const attributes = attributesResult.data as Record<string, AttributeValue>;

    const optionsSchema = variantOptionsSchema(defs);
    const combos = new Set<string>();
    const variants: IVariant[] = input.variants.map((variant: VariantInput, index) => {
      const options = optionsSchema.safeParse(variant.options);
      if (!options.success) throw prefixed(options.error, `variants.${index}.options`);
      const combo = JSON.stringify(Object.entries(options.data).sort(([a], [b]) => a.localeCompare(b)));
      if (combos.has(combo)) throw new HttpError(400, "VALIDATION_ERROR", "Request validation failed", [{ path: `variants.${index}.options`, message: "Another variant already has these options" }]);
      combos.add(combo);
      return { sku: variant.sku, options: options.data as Record<string, string>, price: variant.price, compareAtPrice: variant.compareAtPrice ?? null, stock: variant.stock, isActive: variant.isActive };
    });

    const live = variants.filter((variant) => variant.isActive);
    if (input.status === "active" && live.length === 0) throw new HttpError(400, "VALIDATION_ERROR", "Request validation failed", [{ path: "variants", message: "An active product needs at least one active variant" }]);
    const prices = (live.length ? live : variants).map((variant) => variant.price);

    const facets = new Set<string>();
    if (input.brand) facets.add(`brand:${input.brand}`);
    for (const def of defs) {
      if (!def.filterable) continue;
      if (def.variantAxis) {
        for (const variant of live) if (variant.options[def.key]) facets.add(`${def.key}:${variant.options[def.key]}`);
        continue;
      }
      const value = attributes[def.key];
      if (value === undefined || def.type === "text" || def.type === "number") continue;
      for (const item of Array.isArray(value) ? value : [value]) facets.add(`${def.key}:${String(item)}`);
    }

    return {
      category: category._id,
      categoryPath: [...category.ancestors, category._id],
      attributes,
      variants,
      minPrice: Math.min(...prices),
      maxPrice: Math.max(...prices),
      totalStock: live.reduce((sum, variant) => sum + variant.stock, 0),
      facets: [...facets],
    };
  }

  private async attachImages(images: readonly { key: string; alt: string }[], existing: ReadonlySet<string> = new Set()): Promise<IProductImage[]> {
    const refs = await this.uploads.attach(images.map((image) => image.key), existing);
    return refs.map((ref, index) => ({ key: ref.key, url: ref.url, alt: images[index]?.alt ?? "" }));
  }

  private async releaseImages(keys: readonly string[]): Promise<void> {
    if (keys.length) await this.uploads.release(keys);
  }

  private async freeSlug(title: string): Promise<string> {
    const base = slugify(title) || "product";
    if (!(await Product.exists({ slug: base }))) return base;
    return `${base.slice(0, 90)}-${randomBytes(3).toString("hex")}`;
  }

  private conflict(error: unknown): unknown {
    if (!isDuplicateKey(error)) return error;
    if (error.keyPattern && "variants.sku" in error.keyPattern) return new HttpError(409, "SKU_TAKEN", "One of these SKUs is already used by another product", [{ path: "variants", message: "SKU already in use" }]);
    return new HttpError(409, "SLUG_TAKEN", "Another product already uses that slug", [{ path: "slug", message: "Already in use" }]);
  }
}

// totalStock is the sum over active variants; recomputed server-side so it can never drift from the variants.
export async function recomputeStock(productId: string | Types.ObjectId): Promise<void> {
  await Product.updateOne({ _id: productId }, [
    { $set: { totalStock: { $sum: { $map: { input: { $filter: { input: "$variants", as: "v", cond: "$$v.isActive" } }, as: "v", in: "$$v.stock" } } } } },
  ], { updatePipeline: true });
}
