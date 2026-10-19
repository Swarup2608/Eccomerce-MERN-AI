import { z } from "zod";
import { objectIdSchema, paginationSchema, slugSchema } from "../../lib/pagination.js";
import { MAX_PRICE } from "../products/product.validation.js";
import { DISCOUNT_TYPES, SALE_SCOPES, SALE_STATUSES } from "./sale.model.js";

export const MAX_PERCENT_OFF = 90;
export const MAX_SALE_CATEGORIES = 50;
export const MAX_SALE_PRODUCTS = 500;

const ids = (max: number) => z.array(objectIdSchema).max(max).transform((list) => [...new Set(list.map((id) => id.toLowerCase()))]);

const saleFields = {
  name: z.string().trim().min(2).max(80),
  slug: slugSchema.optional(),
  description: z.string().trim().max(300).default(""),
  discountType: z.enum(DISCOUNT_TYPES),
  discountValue: z.number().int("Use a whole number").min(1),
  appliesTo: z.enum(SALE_SCOPES),
  categoryIds: ids(MAX_SALE_CATEGORIES).default([]),
  productIds: ids(MAX_SALE_PRODUCTS).default([]),
  startsAt: z.coerce.date(),
  endsAt: z.coerce.date(),
  isActive: z.boolean().default(true),
};

export const createSaleSchema = z.object(saleFields).strict();

export type CreateSaleInput = z.infer<typeof createSaleSchema>;

// A partial update; the service merges it over the stored sale and checks the whole result with checkSale().
export const updateSaleSchema = z
  .object({
    name: saleFields.name.optional(),
    slug: slugSchema.optional(),
    description: z.string().trim().max(300).optional(),
    discountType: saleFields.discountType.optional(),
    discountValue: saleFields.discountValue.optional(),
    appliesTo: saleFields.appliesTo.optional(),
    categoryIds: ids(MAX_SALE_CATEGORIES).optional(),
    productIds: ids(MAX_SALE_PRODUCTS).optional(),
    startsAt: saleFields.startsAt.optional(),
    endsAt: saleFields.endsAt.optional(),
    isActive: z.boolean().optional(),
  })
  .strict();

export type UpdateSaleInput = z.infer<typeof updateSaleSchema>;

// Rules that span fields, so they run on the merged sale for both create and update.
export function checkSale(sale: Pick<CreateSaleInput, "discountType" | "discountValue" | "appliesTo" | "categoryIds" | "productIds" | "startsAt" | "endsAt">): { path: string; message: string }[] {
  const issues: { path: string; message: string }[] = [];
  if (sale.discountType === "percent" && sale.discountValue > MAX_PERCENT_OFF) issues.push({ path: "discountValue", message: `At most ${MAX_PERCENT_OFF}% off` });
  if (sale.discountType === "fixed" && sale.discountValue > MAX_PRICE) issues.push({ path: "discountValue", message: "Discount is too large" });
  if (sale.appliesTo === "categories" && sale.categoryIds.length === 0) issues.push({ path: "categoryIds", message: "Pick at least one category" });
  if (sale.appliesTo === "products" && sale.productIds.length === 0) issues.push({ path: "productIds", message: "Pick at least one product" });
  if (sale.endsAt.getTime() <= sale.startsAt.getTime()) issues.push({ path: "endsAt", message: "The sale must end after it starts" });
  return issues;
}

export const adminSalesQuerySchema = z
  .object({ q: z.string().trim().max(100).optional(), status: z.enum(SALE_STATUSES).optional() })
  .extend(paginationSchema.shape)
  .strict();

export type AdminSalesQuery = z.infer<typeof adminSalesQuerySchema>;
