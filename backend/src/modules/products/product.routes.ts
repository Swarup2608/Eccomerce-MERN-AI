import { Router } from "express";
import type { ProductController } from "./product.controller.js";

// Mounted at /api/v1/products (storefront, no sign-in). `/facets` is registered before `/:slug` so it is not read as a slug.
export function productRoutes(controller: ProductController): Router {
  const router = Router();
  router.get("/", controller.list);
  router.get("/facets", controller.facets);
  router.get("/:slug", controller.bySlug);
  return router;
}

// Mounted at /api/v1/admin/products, behind the admin guard.
export function adminProductRoutes(controller: ProductController): Router {
  const router = Router();
  router.get("/", controller.adminList);
  router.post("/", controller.create);
  router.get("/:id", controller.adminGet);
  router.patch("/:id", controller.update);
  router.patch("/:id/status", controller.setStatus);
  router.patch("/:id/variants/:sku/stock", controller.setStock);
  router.delete("/:id", controller.remove);
  return router;
}
