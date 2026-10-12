import { isValidObjectId } from "mongoose";
import { z } from "zod";
import { HttpError } from "./http-error.js";

export const MAX_PAGE = 200;
export const MAX_LIMIT = 48;

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).max(MAX_PAGE).default(1),
  limit: z.coerce.number().int().min(1).max(MAX_LIMIT).default(24),
});

export type Pagination = z.infer<typeof paginationSchema>;

export interface Page<T> {
  items: T[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export const toPage = <T>(items: T[], total: number, { page, limit }: Pagination): Page<T> => ({ items, page, limit, total, totalPages: Math.ceil(total / limit) });

export const skipOf = ({ page, limit }: Pagination): number => (page - 1) * limit;

// Route params are strings from the URL; anything that is not an ObjectId can only ever be "not found".
export function objectId(value: unknown, what = "Resource"): string {
  if (typeof value !== "string" || !isValidObjectId(value) || !/^[a-f0-9]{24}$/i.test(value)) throw new HttpError(404, "NOT_FOUND", `${what} not found`);
  return value;
}

export const objectIdSchema = z.string().regex(/^[a-f0-9]{24}$/i, "Invalid id");

// Shared slug rule for categories and products.
export const slugSchema = z.string().trim().toLowerCase().min(2).max(120).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lowercase letters, numbers and single hyphens");

export function slugify(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100);
}

// Text that is used inside a RegExp (admin search boxes).
export const escapeRegex = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
