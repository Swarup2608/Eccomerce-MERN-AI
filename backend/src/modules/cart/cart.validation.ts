import { z } from "zod";
import { objectIdSchema } from "../../lib/pagination.js";
import { MAX_CART_LINES, MAX_LINE_QUANTITY } from "./cart.model.js";

export const skuSchema = z.string().trim().toUpperCase().regex(/^[A-Z0-9][A-Z0-9_-]{1,63}$/, "Invalid SKU");

const quantitySchema = z.number().int().min(1).max(MAX_LINE_QUANTITY, `At most ${MAX_LINE_QUANTITY} of an item per order`);

export const addCartItemSchema = z.object({ productId: objectIdSchema, sku: skuSchema, quantity: quantitySchema.default(1) }).strict();

export type AddCartItemInput = z.infer<typeof addCartItemSchema>;

// 0 removes the line.
export const setCartQuantitySchema = z.object({ quantity: z.number().int().min(0).max(MAX_LINE_QUANTITY) }).strict();

// The guest cart a browser kept in localStorage, folded into the account cart after sign-in.
export const mergeCartSchema = z.object({ items: z.array(addCartItemSchema).max(MAX_CART_LINES) }).strict();
