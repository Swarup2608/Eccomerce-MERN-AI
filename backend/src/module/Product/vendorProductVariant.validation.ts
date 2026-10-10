import { z } from "zod";

const objectIdSchema = z.string().regex(/^[a-f\d]{24}$/i, "Invalid MongoDB ObjectId.");

export const createVendorProductVariantSchema = z
    .object({
        vendorProductId: objectIdSchema,
        productVariantId: objectIdSchema,
        sellerSku: z.string().trim().min(1).max(100),
        price: z.number().finite().positive().max(1_000_000_000),
        compareAtPrice: z.number().finite().positive().max(1_000_000_000).optional(),
    })
    .refine((data) => data.compareAtPrice === undefined || data.compareAtPrice >= data.price, {
        message: "Compare-at price must be greater than or equal to price.",
        path: ["compareAtPrice"],
    });

export type CreateVendorProductVariantInput = z.infer<typeof createVendorProductVariantSchema>;
