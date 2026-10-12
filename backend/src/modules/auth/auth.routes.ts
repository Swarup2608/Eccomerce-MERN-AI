import { Router, type RequestHandler } from "express";
import { authenticate } from "../../middleware/authenticate.js";
import type { AuthController } from "./auth.controller.js";
import type { AuthService } from "./auth.service.js";

// `strict` is the tight per-IP budget for endpoints that take a password, code or emailed token. Session endpoints
// (/me, /refresh, /logout) are called on normal page views, so they stay on the global limit only.

// Mounted at /api/v1/auth (storefront customers).
export function userAuthRoutes(controller: AuthController, service: AuthService, strict: RequestHandler): Router {
  const router = Router();
  const signedIn = authenticate("user", service);
  router.post("/register", strict, controller.register);
  router.post("/verify-email", strict, controller.verifyEmail);
  router.post("/resend-verification", strict, controller.resendVerification);
  router.post("/forgot-password", strict, controller.forgotPassword("user"));
  router.post("/reset-password", strict, controller.resetPassword("user"));
  router.post("/login", strict, controller.login);
  router.post("/login/verify", strict, controller.loginVerify("user"));
  router.post("/login/resend", strict, controller.resendLoginCode("user"));
  router.post("/change-password", strict, signedIn, controller.changePassword("user"));
  router.post("/mfa", strict, signedIn, controller.setMfa);
  router.post("/refresh", controller.refresh("user"));
  router.post("/logout", controller.logout("user"));
  router.post("/logout-all", signedIn, controller.logoutAll("user"));
  router.get("/me", signedIn, controller.me("user"));
  return router;
}

// Mounted at /api/v1/admin/auth. There is no admin registration: the admin is created by the seed script. Every admin
// sign-in needs an emailed one-time code, and a forgotten password (or a blocked account) is recovered by an emailed link.
export function adminAuthRoutes(controller: AuthController, service: AuthService, strict: RequestHandler): Router {
  const router = Router();
  const signedIn = authenticate("admin", service);
  // Two steps: password (emails a one-time code), then the code (starts the session).
  router.post("/login", strict, controller.adminLogin);
  router.post("/login/verify", strict, controller.loginVerify("admin"));
  router.post("/login/resend", strict, controller.resendLoginCode("admin"));
  router.post("/forgot-password", strict, controller.forgotPassword("admin"));
  router.post("/reset-password", strict, controller.resetPassword("admin"));
  router.post("/change-password", strict, signedIn, controller.changePassword("admin"));
  router.post("/refresh", controller.refresh("admin"));
  router.post("/logout", controller.logout("admin"));
  router.post("/logout-all", signedIn, controller.logoutAll("admin"));
  router.get("/me", signedIn, controller.me("admin"));
  return router;
}
