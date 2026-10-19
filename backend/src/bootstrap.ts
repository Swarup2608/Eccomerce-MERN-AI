import type { Express } from "express";
import type { Redis } from "ioredis";
import { createApp } from "./app.js";
import { deploymentWarnings, loadConfig } from "./config/env.js";
import type { AppConfig } from "./config/env.js";
import { createLogger } from "./lib/logger.js";
import type { Logger } from "./lib/logger.js";
import { createMailer } from "./lib/mailer.js";
import { connectMongo, pingMongo } from "./lib/mongo.js";
import { createRedisClient, pingRedis } from "./lib/redis.js";
import { RedisRateLimitStore } from "./middleware/rate-limit.js";
import { scopePolicies } from "./modules/auth/auth.policy.js";
import { createAuditRecorder } from "./modules/audit/audit.service.js";
import { AuditEvent } from "./modules/audit/audit.model.js";
import { AuthService } from "./modules/auth/auth.service.js";
import { COMMERCE_MODELS, createCommerce } from "./modules/commerce.js";
import type { CommerceServices } from "./modules/commerce.js";
import { R2Storage } from "./lib/storage.js";
import { RazorpayGateway } from "./modules/payments/razorpay.js";
import { StripeGateway } from "./modules/payments/stripe.js";
import { User } from "./modules/users/user.model.js";

export interface Bootstrapped {
  config: AppConfig;
  logger: Logger;
  redis: Redis;
  commerce: CommerceServices;
  app: Express;
}

// Everything the API needs before it can answer a request. Shared by the long-running server and the serverless entry.
export async function bootstrap(): Promise<Bootstrapped> {
  const config = loadConfig();
  const logger = createLogger(config.logLevel, { service: "backend", env: config.env });

  for (const warning of deploymentWarnings(config)) logger.warn("Deployment check", { warning });

  const redis = createRedisClient(config, logger);
  await Promise.all([connectMongo(config, logger), redis.connect()]);
  // The unique email/username/phone indexes are a security guarantee, so build them even when autoIndex is off.
  await Promise.all([User.createIndexes(), AuditEvent.createIndexes(), ...COMMERCE_MODELS.map((model) => model.createIndexes())]);

  const audit = createAuditRecorder(logger);
  const mailer = createMailer(config, logger);
  const authService = new AuthService({
    redis,
    policies: scopePolicies(config.auth.secureCookies),
    secrets: { user: config.auth.accessTokenSecret, admin: config.auth.adminAccessTokenSecret },
    storefrontUrl: config.storefrontUrl,
    adminUrl: config.adminUrl,
    logger: logger.child({ component: "auth" }),
    mailer,
    audit,
  });

  if (!config.r2) logger.warn("R2 is not configured: product image uploads are disabled");
  if (!config.razorpay && !config.stripe) logger.warn("No payment gateway is configured: only Cash on Delivery is available");
  const commerce = createCommerce({
    logger,
    audit,
    mailer,
    storefrontUrl: config.storefrontUrl,
    storage: config.r2 ? new R2Storage(config.r2) : undefined,
    payments: { razorpay: config.razorpay ? new RazorpayGateway(config.razorpay) : undefined, stripe: config.stripe ? new StripeGateway(config.stripe, config.storefrontUrl) : undefined },
  });

  const app = createApp({
    config,
    logger,
    rateLimitStore: new RedisRateLimitStore(redis),
    healthChecks: { mongo: pingMongo, redis: () => pingRedis(redis) },
    authService,
    audit,
    commerce,
  });

  return { config, logger, redis, commerce, app };
}
