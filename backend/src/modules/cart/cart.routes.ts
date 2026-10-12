import { Router } from "express";
import { currentUserId } from "../../middleware/authorize.js";
import type { CartService } from "./cart.service.js";
import { addCartItemSchema, mergeCartSchema, setCartQuantitySchema, skuSchema } from "./cart.validation.js";

// Mounted at /api/v1/cart behind the customer guard. Signed-out shoppers keep their cart in the browser and merge it here.
export function cartRoutes(service: CartService): Router {
  const router = Router();
  router.get("/", async (_req, res) => {
    res.json({ cart: await service.get(currentUserId(res.locals)) });
  });
  router.post("/items", async (req, res) => {
    res.json({ cart: await service.add(currentUserId(res.locals), addCartItemSchema.parse(req.body)) });
  });
  router.patch("/items/:sku", async (req, res) => {
    res.json({ cart: await service.setQuantity(currentUserId(res.locals), skuSchema.parse(req.params.sku), setCartQuantitySchema.parse(req.body).quantity) });
  });
  router.delete("/items/:sku", async (req, res) => {
    res.json({ cart: await service.remove(currentUserId(res.locals), skuSchema.parse(req.params.sku)) });
  });
  router.delete("/", async (_req, res) => {
    await service.clear(currentUserId(res.locals));
    res.status(204).end();
  });
  router.post("/merge", async (req, res) => {
    res.json({ cart: await service.merge(currentUserId(res.locals), mergeCartSchema.parse(req.body).items) });
  });
  return router;
}
