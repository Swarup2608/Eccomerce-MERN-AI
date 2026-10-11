import { z } from "zod";
import { PRODUCT_STATUSES } from "./product.model.js";

const objectIdSchema = (label: string) => z.string().regex(/^[a-f\d]{24}$/i, `Invalid ${label} ID.`);

const productImageSchema = z.object({
    url: z.string().trim().url().max(2048),
    alt: z.string().trim().max(200).optional(),
    isPrimary: z.boolean().default(false),
    sortOrder: z.number().int().min(0).default(0),
});

const productAttributesSchema = z.record(z.string().trim().min(1).max(100), z.string().trim().min(1).max(500));

const variantAttributesSchema = z
    .record(z.string().trim().min(1).max(50), z.string().trim().min(1).max(100))
    .refine((value) => Object.keys(value).length > 0, { message: "A variant needs at least one attribute." })
    .refine((value) => Object.keys(value).length <= 5, { message: "A variant can have at most 5 attributes." });

export const createProductSchema = z.object({
    name: z.string().trim().min(2).max(200),
    slug: z.string().trim().toLowerCase().min(2).max(220).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug must contain lowercase letters, numbers, and hyphens."),
    description: z.string().trim().min(1).max(10000),
    shortDescription: z.string().trim().max(500).optional(),
    brand: z.string().trim().max(100).optional(),
    categoryId: objectIdSchema("category"),
    images: z.array(productImageSchema).max(20).default([]),
    attributes: productAttributesSchema.default({}),
    status: z.enum([PRODUCT_STATUSES.DRAFT, PRODUCT_STATUSES.ACTIVE, PRODUCT_STATUSES.ARCHIVED]).default(PRODUCT_STATUSES.DRAFT),
    // Optional initial variants; a "Standard" default variant is created when omitted.
    variants: z.array(z.object({ attributes: variantAttributesSchema })).max(100).optional(),
});

export type CreateProductInput = z.infer<typeof createProductSchema>;

export const updateProductSchema = createProductSchema
    .omit({ variants: true })
    .partial()
    .refine((value) => Object.keys(value).length > 0, { message: "Provide at least one field to update." });

export type UpdateProductInput = z.infer<typeof updateProductSchema>;

export const listProductsSchema = z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    search: z.string().trim().max(100).optional(),
    categoryId: objectIdSchema("category").optional(),
    brand: z.string().trim().min(1).max(100).optional(),
    sortBy: z.enum(["newest", "name"]).default("newest"),
});

export type ListProductsInput = z.infer<typeof listProductsSchema>;

export const adminListProductsSchema = listProductsSchema.extend({
    status: z.enum([PRODUCT_STATUSES.DRAFT, PRODUCT_STATUSES.ACTIVE, PRODUCT_STATUSES.ARCHIVED]).optional(),
});

export type AdminListProductsInput = z.infer<typeof adminListProductsSchema>;

export const productIdParamsSchema = z.object({ productId: objectIdSchema("product") });
export const productVariantParamsSchema = z.object({ productId: objectIdSchema("product"), variantId: objectIdSchema("variant") });

export const createProductVariantSchema = z.object({
    attributes: variantAttributesSchema,
    isDefault: z.boolean().default(false),
});

export type CreateProductVariantInput = z.infer<typeof createProductVariantSchema>;

export const updateProductVariantSchema = z
    .object({ attributes: variantAttributesSchema.optional(), isDefault: z.literal(true).optional() })
    .refine((value) => value.attributes !== undefined || value.isDefault !== undefined, { message: "Provide attributes or isDefault." });

export type UpdateProductVariantInput = z.infer<typeof updateProductVariantSchema>;
