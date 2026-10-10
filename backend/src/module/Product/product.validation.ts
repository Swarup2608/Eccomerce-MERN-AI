import { z } from "zod";
import { PRODUCT_STATUSES } from "./product.model.js";

const productImageSchema = z.object({
    url: z.string().trim().url().max(2048),
    alt: z.string().trim().max(200).optional(),
    isPrimary: z.boolean().default(false),
    sortOrder: z.number().int().min(0).default(0),
});

const productAttributesSchema = z.record(z.string().trim().min(1).max(100), z.string().trim().min(1).max(500));

export const createProductSchema = z.object({
    name: z.string().trim().min(2).max(200),
    slug: z.string().trim().toLowerCase().min(2).max(220).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug must contain lowercase letters, numbers, and hyphens."),
    description: z.string().trim().min(1).max(10000),
    shortDescription: z.string().trim().max(500).optional(),
    brand: z.string().trim().max(100).optional(),
    categoryId: z.string().regex(/^[a-f\d]{24}$/i, "Invalid category ID."),
    images: z.array(productImageSchema).max(20).default([]),
    attributes: productAttributesSchema.default({}),
    status: z.enum([PRODUCT_STATUSES.DRAFT, PRODUCT_STATUSES.ACTIVE, PRODUCT_STATUSES.ARCHIVED]).default(PRODUCT_STATUSES.DRAFT),
});

export type CreateProductInput = z.infer<typeof createProductSchema>;

export const listProductsSchema = z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    search: z.string().trim().max(100).optional(),
    categoryId: z.string().regex(/^[a-f\d]{24}$/i, "Invalid category ID.").optional(),
    brand: z.string().trim().min(1).max(100).optional(),
    sortBy: z.enum(["newest", "name"]).default("newest"),
});

export type ListProductsInput = z.infer<typeof listProductsSchema>;