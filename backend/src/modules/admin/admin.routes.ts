import { Router } from "express";
import { authenticate } from "../../middleware/authenticate.js";
import { requireRole } from "../../middleware/authorize.js";
import type { AuthService } from "../auth/auth.service.js";
import { createCategoryController } from "../categories/category.controller.js";
import { adminCategoryRoutes } from "../categories/category.routes.js";
import type { CommerceServices } from "../commerce.js";
import { createProductController } from "../products/product.controller.js";
import { adminProductRoutes } from "../products/product.routes.js";
import { createUploadController } from "../uploads/upload.controller.js";
import { USER_ROLES } from "../users/user.validation.js";

// Mounted at /api/v1/admin, after the admin auth routes. Every route below needs an admin session (the admin cookie is
// scoped to this path) and the admin role; the admin IP allowlist in app.ts applies first.
export function adminRoutes(services: CommerceServices, authService: AuthService): Router {
  const router = Router();
  // The guard is attached per resource (not with a bare router.use) so unknown /admin paths still answer 404.
  const guard = [authenticate("admin", authService), requireRole(USER_ROLES.ADMIN)];

  router.use("/categories", guard, adminCategoryRoutes(createCategoryController(services.categories)));
  router.use("/products", guard, adminProductRoutes(createProductController(services.products, services.productHasOrders)));
  router.post("/uploads/images", guard, createUploadController(services.uploads).createImageUpload);
  return router;
}
