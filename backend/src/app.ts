import cookieParser from "cookie-parser";
import express from "express";
import type { Express } from "express";
import type { AppConfig } from "./config/env.js";
import type { Logger } from "./lib/logger.js";
import { errorHandler, notFoundHandler } from "./middleware/error-handler.js";
import { rateLimit } from "./middleware/rate-limit.js";
import type { RateLimitStore } from "./middleware/rate-limit.js";
import { requestContext } from "./middleware/request-context.js";
import { rejectUnsafeKeys } from "./middleware/sanitize.js";
import { adminIpGuard, corsPolicy, noStore, originGuard, securityHeaders } from "./middleware/security.js";
import { authenticate } from "./middleware/authenticate.js";
import { requireRole } from "./middleware/authorize.js";
import { publicCache } from "./middleware/cache.js";
import { addressRoutes } from "./modules/addresses/address.routes.js";
import { cartRoutes } from "./modules/cart/cart.routes.js";
import { USER_ROLES } from "./modules/users/user.validation.js";
import { wishlistRoutes } from "./modules/wishlist/wishlist.routes.js";
import { orderRoutes } from "./modules/orders/order.routes.js";
import { webhookRoutes } from "./modules/payments/webhook.routes.js";
import { adminRoutes } from "./modules/admin/admin.routes.js";
import { createAuthController } from "./modules/auth/auth.controller.js";
import { adminAuthRoutes, userAuthRoutes } from "./modules/auth/auth.routes.js";
import type { AuditRecorder } from "./modules/audit/audit.service.js";
import type { AuthService } from "./modules/auth/auth.service.js";
import { createCategoryController } from "./modules/categories/category.controller.js";
import { categoryRoutes } from "./modules/categories/category.routes.js";
import type { CommerceServices } from "./modules/commerce.js";
import { createProductController } from "./modules/products/product.controller.js";
import { productRoutes } from "./modules/products/product.routes.js";
import { healthRouter } from "./routes/health.js";
import type { HealthCheck } from "./routes/health.js";

export interface AppDependencies {
  config: Pick<AppConfig, "storefrontUrl" | "adminUrl" | "trustProxy" | "rateLimit" | "auth" | "adminAllowedIps">;
  logger: Logger;
  rateLimitStore: RateLimitStore;
  healthChecks: Record<string, HealthCheck>;
  authService: AuthService;
  audit: AuditRecorder;
  commerce: CommerceServices;
}

const JSON_BODY_LIMIT = "100kb";
const AUTH_RATE_LIMIT = { windowMs: 15 * 60 * 1000, max: 50 };
const CATALOG_CACHE_SEC = 60;
const WEBHOOK_BODY_LIMIT = "1mb";
const WEBHOOK_RATE_LIMIT = { windowMs: 60_000, max: 600 };

export function createApp({ config, logger, rateLimitStore, healthChecks, authService, audit, commerce }: AppDependencies): Express {
  const app = express();

  app.disable("x-powered-by");
  app.set("trust proxy", config.trustProxy);
  // The simple parser never builds nested objects from the query string (`?a[$ne]=1` stays a plain key).
  app.set("query parser", "simple");

  app.use(requestContext(logger));
  app.use(securityHeaders);
  app.use(noStore);
  app.use(corsPolicy([config.storefrontUrl, config.adminUrl]));
  app.use(originGuard([config.storefrontUrl, config.adminUrl]));
  // Payment webhooks need the exact raw bytes for their signatures, come from a few gateway IPs in bursts, and never carry
  // cookies, so they are mounted before the JSON parser and the global per-IP limit, with their own budget.
  app.use(
    "/api/v1/webhooks",
    rateLimit({ store: rateLimitStore, ...WEBHOOK_RATE_LIMIT, prefix: "webhook", logger }),
    express.raw({ type: "application/json", limit: WEBHOOK_BODY_LIMIT }),
    webhookRoutes({ orders: commerce.orders, razorpay: commerce.payments.razorpay, stripe: commerce.payments.stripe, audit, logger }),
  );
  app.use(rateLimit({ store: rateLimitStore, windowMs: config.rateLimit.windowMs, max: config.rateLimit.max, prefix: "global", logger }));
  app.use(express.json({ limit: JSON_BODY_LIMIT, strict: true, type: "application/json" }));
  app.use(cookieParser());
  app.use(rejectUnsafeKeys);

  app.use("/health", healthRouter(healthChecks));

  // Credential endpoints (password, code or emailed token) get a much tighter per-IP budget, and it fails closed if Redis is
  // unavailable. Session endpoints (/me, /refresh, /logout) only have the global limit, so browsing never runs into it.
  const authLimiter = rateLimit({ store: rateLimitStore, ...AUTH_RATE_LIMIT, prefix: "auth", logger, failOpen: false });
  const authController = createAuthController(authService, config.auth.secureCookies);
  app.use("/api/v1/admin", adminIpGuard(config.adminAllowedIps, (ip) => audit.record("admin_ip_blocked", { scope: "admin", ip })));
  app.use("/api/v1/auth", userAuthRoutes(authController, authService, authLimiter));
  app.use("/api/v1/admin/auth", adminAuthRoutes(authController, authService, authLimiter));
  app.use("/api/v1/admin", adminRoutes(commerce, authService));

  app.use("/api/v1/categories", publicCache(CATALOG_CACHE_SEC), categoryRoutes(createCategoryController(commerce.categories)));
  app.use("/api/v1/products", publicCache(CATALOG_CACHE_SEC), productRoutes(createProductController(commerce.products, commerce.productHasOrders)));

  // Customer account features: a storefront session with the customer role.
  const customer = [authenticate("user", authService), requireRole(USER_ROLES.USER)];
  app.use("/api/v1/cart", customer, cartRoutes(commerce.cart));
  app.use("/api/v1/wishlist", customer, wishlistRoutes(commerce.wishlist));
  app.use("/api/v1/addresses", customer, addressRoutes(commerce.addresses));
  app.use("/api/v1/orders", customer, orderRoutes(commerce.orders));
  app.get("/api/v1/checkout/config", (_req, res) => {
    res.json(commerce.orders.checkoutConfig());
  });

  const api = express.Router();
  api.get("/", (_req, res) => {
    res.json({ name: "ecommerce-api", version: "v1" });
  });
  app.use("/api/v1", api);

  app.use(notFoundHandler);
  app.use(errorHandler(logger));

  return app;
}
