import { z } from "zod";
import { HttpError } from "../../lib/http-error.js";
import { objectIdSchema, paginationSchema, slugSchema } from "../../lib/pagination.js";
import { facetValueSchema } from "../categories/category.validation.js";
import { IMAGE_KEY_PATTERN } from "../uploads/upload.service.js";
import { PRODUCT_STATUSES } from "./product.model.js";

export const MAX_VARIANTS = 100;
export const MAX_IMAGES = 10;
// ₹1 crore, in paise.
export const MAX_PRICE = 1_000_000_000;

const priceSchema = z.number().int("Prices are whole paise").min(0).max(MAX_PRICE);

export const variantInputSchema = z
  .object({
    sku: z.string().trim().toUpperCase().regex(/^[A-Z0-9][A-Z0-9_-]{1,63}$/, "SKU must be 2-64 letters, numbers, hyphens or underscores"),
    options: z.record(z.string(), z.string()).default({}),
    price: priceSchema,
    compareAtPrice: priceSchema.nullable().optional(),
    stock: z.number().int().min(0).max(1_000_000),
    isActive: z.boolean().default(true),
  })
  .strict()
  .refine((variant) => variant.compareAtPrice == null || variant.compareAtPrice > variant.price, { path: ["compareAtPrice"], message: "Compare-at price must be higher than the price" });

export type VariantInput = z.infer<typeof variantInputSchema>;

const imageInputSchema = z.object({ key: z.string().regex(IMAGE_KEY_PATTERN, "Unknown image"), alt: z.string().trim().max(150).default("") }).strict();

const productFields = {
  title: z.string().trim().min(2).max(200),
  slug: slugSchema.optional(),
  description: z.string().trim().max(10_000).default(""),
  // The brand doubles as a facet value, so it follows the same character rules as attribute options.
  brand: z.union([facetValueSchema.pipe(z.string().max(60)), z.literal("")]).default(""),
  categoryId: objectIdSchema,
  // Shape depends on the category; checked against its attribute definitions in the service.
  attributes: z.record(z.string(), z.unknown()).default({}),
  variants: z
    .array(variantInputSchema)
    .min(1, "Add at least one variant")
    .max(MAX_VARIANTS)
    .refine((variants) => new Set(variants.map((variant) => variant.sku)).size === variants.length, "SKUs must be unique"),
  images: z
    .array(imageInputSchema)
    .max(MAX_IMAGES)
    .refine((images) => new Set(images.map((image) => image.key)).size === images.length, "Images must be unique")
    .default([]),
  tags: z
    .array(z.string().trim().toLowerCase().min(1).max(30))
    .max(20)
    .transform((tags) => [...new Set(tags)])
    .default([]),
  status: z.enum(PRODUCT_STATUSES).default("draft"),
  isFeatured: z.boolean().default(false),
};

export const createProductSchema = z.object(productFields).strict();

export type CreateProductInput = z.infer<typeof createProductSchema>;

// A partial update; the service merges it over the stored product and re-validates the whole thing.
export const updateProductSchema = z
  .object({
    title: productFields.title.optional(),
    slug: slugSchema.optional(),
    description: z.string().trim().max(10_000).optional(),
    brand: z.union([facetValueSchema.pipe(z.string().max(60)), z.literal("")]).optional(),
    categoryId: objectIdSchema.optional(),
    attributes: z.record(z.string(), z.unknown()).optional(),
    variants: productFields.variants.optional(),
    images: z.array(imageInputSchema).max(MAX_IMAGES).refine((images) => new Set(images.map((image) => image.key)).size === images.length, "Images must be unique").optional(),
    tags: z.array(z.string().trim().toLowerCase().min(1).max(30)).max(20).transform((tags) => [...new Set(tags)]).optional(),
    status: z.enum(PRODUCT_STATUSES).optional(),
    isFeatured: z.boolean().optional(),
  })
  .strict();

export type UpdateProductInput = z.infer<typeof updateProductSchema>;

export const setStatusSchema = z.object({ status: z.enum(PRODUCT_STATUSES) }).strict();

// Either an absolute stock count (a stock take) or a relative adjustment (a delivery or a write-off).
export const setStockSchema = z.union([z.object({ stock: z.number().int().min(0).max(1_000_000) }).strict(), z.object({ delta: z.number().int().min(-1_000_000).max(1_000_000).refine((value) => value !== 0, "Delta cannot be 0") }).strict()]);

export type SetStockInput = z.infer<typeof setStockSchema>;

export const PRODUCT_SORTS = ["newest", "price_asc", "price_desc", "relevance"] as const;

export type ProductSort = (typeof PRODUCT_SORTS)[number];

const MAX_FACET_KEYS = 10;
const MAX_FACET_VALUES = 20;
const FACET_PARAM = /^f_([a-z][a-z0-9_]{0,29})$/;

const optionalPrice = z.coerce.number().int().min(0).max(MAX_PRICE).optional();

const listQueryBase = z
  .object({
    q: z.string().trim().max(100).optional(),
    category: slugSchema.optional(),
    brand: z.string().optional(),
    minPrice: optionalPrice,
    maxPrice: optionalPrice,
    inStock: z.enum(["true", "false"]).optional(),
    featured: z.enum(["true", "false"]).optional(),
    sort: z.enum(PRODUCT_SORTS).optional(),
  })
  .extend(paginationSchema.shape)
  .strict();

export interface ProductListQuery {
  q: string | undefined;
  category: string | undefined;
  minPrice: number | undefined;
  maxPrice: number | undefined;
  inStock: boolean;
  featured: boolean;
  sort: ProductSort;
  page: number;
  limit: number;
  // Facet key → accepted values (OR within a key, AND across keys). "brand" is one of them.
  facets: Map<string, string[]>;
}

const splitValues = (raw: unknown): string[] => (Array.isArray(raw) ? raw : [raw]).flatMap((value) => (typeof value === "string" ? value.split(",") : [])).map((value) => value.trim()).filter(Boolean);

// Attribute filters arrive as `f_<key>=a,b` (dotted keys are rejected by the request sanitiser); `brand=` is a shortcut for `f_brand=`.
export function parseProductListQuery(query: Record<string, unknown>): ProductListQuery {
  const base: Record<string, unknown> = {};
  const facets = new Map<string, string[]>();
  for (const [name, raw] of Object.entries(query)) {
    const match = FACET_PARAM.exec(name);
    if (!match?.[1]) {
      base[name] = Array.isArray(raw) ? raw[0] : raw;
      continue;
    }
    const values = splitValues(raw);
    if (values.length) facets.set(match[1], values);
  }
  const parsed = listQueryBase.parse(base);
  if (parsed.brand) facets.set("brand", [...(facets.get("brand") ?? []), ...splitValues(parsed.brand)]);

  if (facets.size > MAX_FACET_KEYS) throw new HttpError(400, "VALIDATION_ERROR", `At most ${MAX_FACET_KEYS} filters`);
  for (const [key, values] of facets) {
    if (values.length > MAX_FACET_VALUES) throw new HttpError(400, "VALIDATION_ERROR", `At most ${MAX_FACET_VALUES} values for ${key}`);
    for (const value of values) if (!facetValueSchema.safeParse(value).success) throw new HttpError(400, "VALIDATION_ERROR", `Invalid value for ${key}`);
  }
  if (parsed.minPrice !== undefined && parsed.maxPrice !== undefined && parsed.minPrice > parsed.maxPrice) throw new HttpError(400, "VALIDATION_ERROR", "minPrice cannot be above maxPrice");

  return {
    q: parsed.q || undefined,
    category: parsed.category,
    minPrice: parsed.minPrice,
    maxPrice: parsed.maxPrice,
    inStock: parsed.inStock === "true",
    featured: parsed.featured === "true",
    sort: parsed.sort ?? (parsed.q ? "relevance" : "newest"),
    page: parsed.page,
    limit: parsed.limit,
    facets,
  };
}

export const adminProductQuerySchema = z
  .object({
    q: z.string().trim().max(100).optional(),
    status: z.enum(PRODUCT_STATUSES).optional(),
    categoryId: objectIdSchema.optional(),
    lowStock: z.enum(["true", "false"]).optional(),
  })
  .extend(paginationSchema.shape)
  .strict();
