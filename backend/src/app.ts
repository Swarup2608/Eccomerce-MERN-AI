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
import { createAuthController } from "./modules/auth/auth.controller.js";
import { adminAuthRoutes, userAuthRoutes } from "./modules/auth/auth.routes.js";
import type { AuditRecorder } from "./modules/audit/audit.service.js";
import type { AuthService } from "./modules/auth/auth.service.js";
import { healthRouter } from "./routes/health.js";
import type { HealthCheck } from "./routes/health.js";

export interface AppDependencies {
  config: Pick<AppConfig, "storefrontUrl" | "adminUrl" | "trustProxy" | "rateLimit" | "auth" | "adminAllowedIps">;
  logger: Logger;
  rateLimitStore: RateLimitStore;
  healthChecks: Record<string, HealthCheck>;
  authService: AuthService;
  audit: AuditRecorder;
}

const JSON_BODY_LIMIT = "100kb";
const AUTH_RATE_LIMIT = { windowMs: 15 * 60 * 1000, max: 50 };

export function createApp({ config, logger, rateLimitStore, healthChecks, authService, audit }: AppDependencies): Express {
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

  const api = express.Router();
  api.get("/", (_req, res) => {
    res.json({ name: "ecommerce-api", version: "v1" });
  });
  app.use("/api/v1", api);

  app.use(notFoundHandler);
  app.use(errorHandler(logger));

  return app;
}
