import { Router } from "express";
import { authenticate } from "../../middleware/authenticate.js";
import type { AuthController } from "./auth.controller.js";
import type { AuthService } from "./auth.service.js";

// Mounted at /api/v1/auth (storefront customers).
export function userAuthRoutes(controller: AuthController, service: AuthService): Router {
  const router = Router();
  router.post("/register", controller.register);
  router.post("/login", controller.login);
  router.post("/refresh", controller.refresh("user"));
  router.post("/logout", controller.logout("user"));
  router.post("/logout-all", authenticate("user", service), controller.logoutAll("user"));
  router.get("/me", authenticate("user", service), controller.me("user"));
  return router;
}

// Mounted at /api/v1/admin/auth. There is no admin registration: admins are created by the seed script.
export function adminAuthRoutes(controller: AuthController, service: AuthService): Router {
  const router = Router();
  router.post("/login", controller.adminLogin);
  router.post("/refresh", controller.refresh("admin"));
  router.post("/logout", controller.logout("admin"));
  router.post("/logout-all", authenticate("admin", service), controller.logoutAll("admin"));
  router.get("/me", authenticate("admin", service), controller.me("admin"));
  return router;
}
