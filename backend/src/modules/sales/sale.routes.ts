import { Router } from "express";
import { HttpError } from "../../lib/http-error.js";
import { objectId, slugSchema } from "../../lib/pagination.js";
import { currentUserId } from "../../middleware/authorize.js";
import type { SaleService } from "./sale.service.js";
import { adminSalesQuerySchema, createSaleSchema, updateSaleSchema } from "./sale.validation.js";

// Mounted at /api/v1/sales (storefront, no sign-in): live and upcoming sales for the Sales page.
export function saleRoutes(service: SaleService): Router {
  const router = Router();
  router.get("/", async (_req, res) => {
    res.json(await service.listPublic());
  });
  router.get("/:slug", async (req, res) => {
    const slug = slugSchema.safeParse(req.params.slug);
    if (!slug.success) throw new HttpError(404, "NOT_FOUND", "Sale not found");
    res.json({ sale: await service.getPublic(slug.data) });
  });
  return router;
}

// Mounted at /api/v1/admin/sales behind the admin guard.
export function adminSaleRoutes(service: SaleService): Router {
  const router = Router();
  router.get("/", async (req, res) => {
    res.json(await service.adminList(adminSalesQuerySchema.parse(req.query)));
  });
  router.post("/", async (req, res) => {
    res.status(201).json({ sale: await service.create(createSaleSchema.parse(req.body), currentUserId(res.locals)) });
  });
  router.get("/:id", async (req, res) => {
    res.json({ sale: await service.adminGet(objectId(req.params.id, "Sale")) });
  });
  router.patch("/:id", async (req, res) => {
    res.json({ sale: await service.update(objectId(req.params.id, "Sale"), updateSaleSchema.parse(req.body), currentUserId(res.locals)) });
  });
  router.delete("/:id", async (req, res) => {
    await service.remove(objectId(req.params.id, "Sale"), currentUserId(res.locals));
    res.status(204).end();
  });
  return router;
}
