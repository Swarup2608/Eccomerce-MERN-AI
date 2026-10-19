import { createServer } from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Express } from "express";
import type { Redis } from "ioredis";
import { createApp } from "./app.js";
import { deploymentWarnings, loadConfig } from "./config/env.js";
import type { AppConfig } from "./config/env.js";
import { createLogger } from "./lib/logger.js";
import type { Logger } from "./lib/logger.js";
import { createMailer } from "./lib/mailer.js";
import { connectMongo, disconnectMongo, pingMongo } from "./lib/mongo.js";
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

const SHUTDOWN_TIMEOUT_MS = 10_000;
const ORDER_SWEEP_INTERVAL_MS = 60_000;
const ORDER_SWEEP_LOCK = "lock:order-expiry";

interface Runtime {
  config: AppConfig;
  logger: Logger;
  redis: Redis;
  commerce: CommerceServices;
  app: Express;
}

async function init(): Promise<Runtime> {
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

const logStartupFailure = (error: unknown): void => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${JSON.stringify({ time: new Date().toISOString(), level: "error", msg: "Startup failed", error: message })}\n`);
};

// Vercel (@vercel/node) calls this export per request and never runs listen(). The app is built once per warm instance,
// and a failed start is retried on the next request instead of crashing the function.
let ready: Promise<Runtime> | undefined;

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  ready ??= init().catch((error: unknown) => {
    ready = undefined;
    throw error;
  });

  let app: Express;
  try {
    ({ app } = await ready);
  } catch (error) {
    logStartupFailure(error);
    res.statusCode = 503;
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Cache-Control", "no-store");
    res.end(JSON.stringify({ error: { code: "SERVICE_UNAVAILABLE", message: "Service is starting or misconfigured" } }));
    return;
  }

  app(req, res);
}

async function main(): Promise<void> {
  const { config, logger, redis, commerce, app } = await init();

  const server = createServer(app);
  // Bound how long a slow client can hold a socket open (slowloris protection).
  server.headersTimeout = 20_000;
  server.requestTimeout = 30_000;
  server.keepAliveTimeout = 5_000;
  server.maxHeadersCount = 100;

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(config.port, config.host, () => resolve());
  });
  logger.info("API listening", { host: config.host, port: config.port });

  // Unpaid online orders hand their stock back once the payment window closes. With several instances, a short Redis
  // lock lets only one of them sweep per interval.
  const sweep = setInterval(() => {
    void (async () => {
      try {
        if ((await redis.set(ORDER_SWEEP_LOCK, "1", "PX", ORDER_SWEEP_INTERVAL_MS - 5_000, "NX")) !== "OK") return;
        const expired = await commerce.orders.expireStale();
        if (expired > 0) logger.info("Expired unpaid orders", { count: expired });
      } catch (error) {
        logger.error("Order expiry sweep failed", { error });
      }
    })();
  }, ORDER_SWEEP_INTERVAL_MS);
  sweep.unref();

  let shuttingDown = false;
  const shutdown = async (reason: string, exitCode: number): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info("Shutting down", { reason });

    const forceExit = setTimeout(() => {
      logger.error("Graceful shutdown timed out, forcing exit");
      process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS);
    forceExit.unref();

    clearInterval(sweep);
    const closed = new Promise<void>((resolve) => server.close(() => resolve()));
    server.closeIdleConnections();
    await closed;
    await Promise.allSettled([disconnectMongo(), redis.quit()]);

    clearTimeout(forceExit);
    process.exit(exitCode);
  };

  process.once("SIGTERM", () => void shutdown("SIGTERM", 0));
  process.once("SIGINT", () => void shutdown("SIGINT", 0));
  process.on("unhandledRejection", (reason) => {
    logger.error("Unhandled promise rejection", { error: reason });
    void shutdown("unhandledRejection", 1);
  });
  process.on("uncaughtException", (error) => {
    logger.error("Uncaught exception", { error });
    void shutdown("uncaughtException", 1);
  });
}

// Vercel sets VERCEL=1; anywhere else (npm run dev, npm start, Docker) this file runs as a long-lived server.
if (!process.env.VERCEL) {
  main().catch((error: unknown) => {
    logStartupFailure(error);
    process.exit(1);
  });
}
