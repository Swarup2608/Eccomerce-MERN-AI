import { z } from "zod";
import { objectIdSchema, slugSchema } from "../../lib/pagination.js";

export const ATTRIBUTE_TYPES = ["text", "number", "boolean", "select", "multiselect"] as const;

export type AttributeType = (typeof ATTRIBUTE_TYPES)[number];

export const MAX_ATTRIBUTES = 30;

// Keys a product already has as a field (or that the filter API uses), so a category cannot define them as attributes.
const RESERVED_KEYS = new Set(["brand", "price", "category", "q", "sort", "page", "limit", "instock", "status", "title", "tags"]);

// Option values end up in facet strings ("color:Red") and comma-separated filter query params, so they cannot hold ":" or ",".
export const facetValueSchema = z.string().trim().min(1).max(40).regex(/^[^:,]+$/, "Cannot contain ':' or ','");

// One attribute a category defines for its products, e.g. clothing has size and colour, phones have storage.
// A `variantAxis` attribute is chosen per variant (each size/colour has its own SKU, price and stock) instead of per product.
export const attributeDefSchema = z
  .object({
    key: z.string().trim().regex(/^[a-z][a-z0-9_]{0,29}$/, "Use lowercase letters, numbers and underscores, starting with a letter").refine((key) => !RESERVED_KEYS.has(key), "That key is reserved"),
    label: z.string().trim().min(1).max(50),
    type: z.enum(ATTRIBUTE_TYPES),
    options: z.array(facetValueSchema).max(100).default([]),
    unit: z.string().trim().max(15).optional(),
    required: z.boolean().default(false),
    filterable: z.boolean().default(false),
    variantAxis: z.boolean().default(false),
  })
  .strict()
  .superRefine((def, ctx) => {
    const isChoice = def.type === "select" || def.type === "multiselect";
    if (isChoice && def.options.length === 0) ctx.addIssue({ code: "custom", path: ["options"], message: "Choice attributes need at least one option" });
    if (!isChoice && def.options.length > 0) ctx.addIssue({ code: "custom", path: ["options"], message: "Only choice attributes have options" });
    if (new Set(def.options.map((option) => option.toLowerCase())).size !== def.options.length) ctx.addIssue({ code: "custom", path: ["options"], message: "Options must be unique" });
    if (def.variantAxis && def.type !== "select") ctx.addIssue({ code: "custom", path: ["variantAxis"], message: "Only single-choice attributes can vary per variant" });
  });

export type AttributeDef = z.infer<typeof attributeDefSchema>;

const attributesSchema = z
  .array(attributeDefSchema)
  .max(MAX_ATTRIBUTES)
  .refine((defs) => new Set(defs.map((def) => def.key)).size === defs.length, "Attribute keys must be unique")
  .refine((defs) => defs.filter((def) => def.variantAxis).length <= 3, "At most 3 attributes can vary per variant");

const categoryFields = {
  name: z.string().trim().min(1).max(80),
  slug: slugSchema.optional(),
  description: z.string().trim().max(2000).default(""),
  parentId: objectIdSchema.nullable().default(null),
  isActive: z.boolean().default(true),
  sortOrder: z.number().int().min(0).max(10_000).default(0),
  attributes: attributesSchema.default([]),
};

export const createCategorySchema = z.object(categoryFields).strict();

export type CreateCategoryInput = z.infer<typeof createCategorySchema>;

export const updateCategorySchema = z
  .object({
    name: categoryFields.name.optional(),
    slug: slugSchema.optional(),
    description: z.string().trim().max(2000).optional(),
    parentId: objectIdSchema.nullable().optional(),
    isActive: z.boolean().optional(),
    sortOrder: categoryFields.sortOrder.optional(),
    attributes: attributesSchema.optional(),
  })
  .strict();

export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;
