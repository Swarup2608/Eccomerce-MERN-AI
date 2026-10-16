import { Router } from "express";
import { z } from "zod";
import { objectId, objectIdSchema } from "../../lib/pagination.js";
import { currentUserId } from "../../middleware/authorize.js";
import type { WishlistService } from "./wishlist.service.js";

// Null saves into (or moves back to) the default "Saved items" list; leaving it out keeps a saved product where it is.
const saveSchema = z.object({ listId: objectIdSchema.nullable().optional() }).strict();
const listNameSchema = z.object({ name: z.string().trim().min(1).max(40) }).strict();
const deleteListQuerySchema = z.object({ removeItems: z.enum(["true", "false"]).optional() }).strict();

// Mounted at /api/v1/wishlist behind the customer guard. The /lists routes have two segments, so they never collide with
// /:productId.
export function wishlistRoutes(service: WishlistService): Router {
  const router = Router();
  router.get("/", async (_req, res) => {
    const userId = currentUserId(res.locals);
    const [items, lists] = await Promise.all([service.list(userId), service.groups(userId)]);
    res.json({ items, lists });
  });
  router.get("/ids", async (_req, res) => {
    res.json({ productIds: await service.ids(currentUserId(res.locals)) });
  });

  router.get("/lists", async (_req, res) => {
    res.json({ lists: await service.groups(currentUserId(res.locals)) });
  });
  router.post("/lists", async (req, res) => {
    res.status(201).json({ list: await service.createGroup(currentUserId(res.locals), listNameSchema.parse(req.body).name) });
  });
  router.patch("/lists/:listId", async (req, res) => {
    res.json({ list: await service.renameGroup(currentUserId(res.locals), objectId(req.params.listId, "List"), listNameSchema.parse(req.body).name) });
  });
  router.delete("/lists/:listId", async (req, res) => {
    const { removeItems } = deleteListQuerySchema.parse(req.query);
    await service.deleteGroup(currentUserId(res.locals), objectId(req.params.listId, "List"), removeItems === "true");
    res.status(204).end();
  });

  router.put("/:productId", async (req, res) => {
    const { listId } = saveSchema.parse(req.body ?? {});
    await service.add(currentUserId(res.locals), objectId(req.params.productId, "Product"), listId);
    res.status(204).end();
  });
  router.delete("/:productId", async (req, res) => {
    await service.remove(currentUserId(res.locals), objectId(req.params.productId, "Product"));
    res.status(204).end();
  });
  return router;
}
