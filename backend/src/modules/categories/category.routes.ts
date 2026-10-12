import { Router } from "express";
import type { CategoryController } from "./category.controller.js";

// Mounted at /api/v1/categories (storefront, no sign-in).
export function categoryRoutes(controller: CategoryController): Router {
  const router = Router();
  router.get("/", controller.tree);
  router.get("/:slug", controller.bySlug);
  return router;
}

// Mounted at /api/v1/admin/categories, behind the admin guard.
export function adminCategoryRoutes(controller: CategoryController): Router {
  const router = Router();
  router.get("/", controller.adminList);
  router.post("/", controller.create);
  router.get("/:id", controller.adminGet);
  router.patch("/:id", controller.update);
  router.delete("/:id", controller.remove);
  return router;
}
