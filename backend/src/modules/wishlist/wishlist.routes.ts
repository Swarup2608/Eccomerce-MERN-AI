import { Router } from "express";
import { objectId } from "../../lib/pagination.js";
import { currentUserId } from "../../middleware/authorize.js";
import type { WishlistService } from "./wishlist.service.js";

// Mounted at /api/v1/wishlist behind the customer guard.
export function wishlistRoutes(service: WishlistService): Router {
  const router = Router();
  router.get("/", async (_req, res) => {
    res.json({ items: await service.list(currentUserId(res.locals)) });
  });
  router.get("/ids", async (_req, res) => {
    res.json({ productIds: await service.ids(currentUserId(res.locals)) });
  });
  router.put("/:productId", async (req, res) => {
    await service.add(currentUserId(res.locals), objectId(req.params.productId, "Product"));
    res.status(204).end();
  });
  router.delete("/:productId", async (req, res) => {
    await service.remove(currentUserId(res.locals), objectId(req.params.productId, "Product"));
    res.status(204).end();
  });
  return router;
}
