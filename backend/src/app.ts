import express from "express";
import type { Express } from "express";
import type { AppConfig } from "./config/env.js";
import type { Logger } from "./lib/logger.js";
import { errorHandler, notFoundHandler } from "./middleware/error-handler.js";
import { rateLimit } from "./middleware/rate-limit.js";
import type { RateLimitStore } from "./middleware/rate-limit.js";
import { requestContext } from "./middleware/request-context.js";
import { rejectUnsafeKeys } from "./middleware/sanitize.js";
import { corsPolicy, noStore, originGuard, securityHeaders } from "./middleware/security.js";
import { healthRouter } from "./routes/health.js";
import type { HealthCheck } from "./routes/health.js";

export interface AppDependencies {
  config: Pick<AppConfig, "corsOrigins" | "trustProxy" | "rateLimit">;
  logger: Logger;
  rateLimitStore: RateLimitStore;
  healthChecks: Record<string, HealthCheck>;
}

const JSON_BODY_LIMIT = "100kb";

export function createApp({ config, logger, rateLimitStore, healthChecks }: AppDependencies): Express {
  const app = express();

  app.disable("x-powered-by");
  app.set("trust proxy", config.trustProxy);
  // The simple parser never builds nested objects from the query string (`?a[$ne]=1` stays a plain key).
  app.set("query parser", "simple");

  app.use(requestContext(logger));
  app.use(securityHeaders);
  app.use(noStore);
  app.use(corsPolicy(config.corsOrigins));
  app.use(originGuard(config.corsOrigins));
  app.use(rateLimit({ store: rateLimitStore, windowMs: config.rateLimit.windowMs, max: config.rateLimit.max, prefix: "global", logger }));
  app.use(express.json({ limit: JSON_BODY_LIMIT, strict: true, type: "application/json" }));
  app.use(rejectUnsafeKeys);

  app.use("/health", healthRouter(healthChecks));

  const api = express.Router();
  api.get("/", (_req, res) => {
    res.json({ name: "ecommerce-api", version: "v1" });
  });
  app.use("/api/v1", api);

  app.use(notFoundHandler);
  app.use(errorHandler(logger));

  return app;
}
