import { z } from "zod";

export const createCategorySchema = z.object({
    name: z.string().trim().min(2).max(100),
    slug: z
        .string()
        .trim()
        .toLowerCase()
        .min(2)
        .max(120)
        .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug must contain lowercase letters, numbers, and hyphens."),
    description: z.string().trim().max(500).optional(),
    image: z.string().trim().url().optional(),
    isActive: z.boolean().optional(),
    sortOrder: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).optional(),
});

export type CreateCategoryInput = z.infer<typeof createCategorySchema>;

export const listCategoriesSchema = z.object({
    includeInactive: z
        .enum(["true", "false"])
        .default("false")
        .transform((value) => value === "true"),
});

export type ListCategoriesInput = z.infer<typeof listCategoriesSchema>;
