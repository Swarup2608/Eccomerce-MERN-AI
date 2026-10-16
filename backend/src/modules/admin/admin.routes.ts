import { Router, type RequestHandler } from "express";
import { authenticate } from "../../middleware/authenticate.js";
import { requireRole } from "../../middleware/authorize.js";
import type { AuthService } from "../auth/auth.service.js";
import { createCategoryController } from "../categories/category.controller.js";
import { adminCategoryRoutes } from "../categories/category.routes.js";
import type { CommerceServices } from "../commerce.js";
import { createProductController } from "../products/product.controller.js";
import { adminProductRoutes } from "../products/product.routes.js";
import { createUploadController } from "../uploads/upload.controller.js";
import { USER_ROLES, USER_STATUSES } from "../users/user.validation.js";
import { z } from "zod";
import { objectId, paginationSchema } from "../../lib/pagination.js";
import { currentUserId } from "../../middleware/authorize.js";
import { adminOrderRoutes } from "../orders/order.routes.js";
import { adminSaleRoutes } from "../sales/sale.routes.js";
import { CustomerAdminService } from "./customer.service.js";

const customersQuerySchema = z.object({ q: z.string().trim().max(100).optional(), status: z.enum([USER_STATUSES.ACTIVE, USER_STATUSES.SUSPENDED, USER_STATUSES.INACTIVE]).optional() }).extend(paginationSchema.shape).strict();
const customerStatusSchema = z.object({ status: z.enum([USER_STATUSES.ACTIVE, USER_STATUSES.SUSPENDED]) }).strict();

// Mounted at /api/v1/admin, after the admin auth routes. Every route below needs an admin session (the admin cookie is
// scoped to this path) and the admin role; the admin IP allowlist in app.ts applies first.
export function adminRoutes(services: CommerceServices, authService: AuthService): Router {
  const router = Router();
  // The guard is attached per resource (not with a bare router.use) so unknown /admin paths still answer 404.
  const guard: RequestHandler[] = [authenticate("admin", authService), requireRole(USER_ROLES.ADMIN)];

  router.use("/categories", guard, adminCategoryRoutes(createCategoryController(services.categories)));
  router.use("/products", guard, adminProductRoutes(createProductController(services.products, services.productHasOrders)));
  router.post("/uploads/images", guard, createUploadController(services.uploads).createImageUpload);
  router.use("/orders", guard, adminOrderRoutes(services.orders));
  router.use("/sales", guard, adminSaleRoutes(services.sales));

  router.use("/stats", guard, statsRoutes(services));
  router.use("/customers", guard, customerRoutes(new CustomerAdminService(services.orders, authService)));
  return router;
}

function statsRoutes(services: CommerceServices): Router {
  const router = Router();
  router.get("/", async (_req, res) => {
    res.json({ stats: await services.orders.stats() });
  });
  return router;
}

function customerRoutes(customers: CustomerAdminService): Router {
  const router = Router();
  router.get("/", async (req, res) => {
    res.json(await customers.list(customersQuerySchema.parse(req.query)));
  });
  router.get("/:id", async (req, res) => {
    res.json({ customer: await customers.get(objectId(req.params.id, "Customer")) });
  });
  router.patch("/:id/status", async (req, res) => {
    res.json({ customer: await customers.setStatus(objectId(req.params.id, "Customer"), customerStatusSchema.parse(req.body).status, currentUserId(res.locals)) });
  });
  return router;
}
