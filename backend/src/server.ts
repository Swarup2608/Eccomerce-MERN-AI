import { createServer } from "node:http";
import { createApp } from "./app.js";
import { loadConfig } from "./config/env.js";
import { createLogger } from "./lib/logger.js";
import { connectMongo, disconnectMongo, pingMongo } from "./lib/mongo.js";
import { createRedisClient, pingRedis } from "./lib/redis.js";
import { RedisRateLimitStore } from "./middleware/rate-limit.js";

const SHUTDOWN_TIMEOUT_MS = 10_000;

async function main(): Promise<void> {
  const config = loadConfig();
  const logger = createLogger(config.logLevel, { service: "backend", env: config.env });

  const redis = createRedisClient(config, logger);
  await Promise.all([connectMongo(config, logger), redis.connect()]);

  const app = createApp({
    config,
    logger,
    rateLimitStore: new RedisRateLimitStore(redis),
    healthChecks: { mongo: pingMongo, redis: () => pingRedis(redis) },
  });

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

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${JSON.stringify({ time: new Date().toISOString(), level: "error", msg: "Startup failed", error: message })}\n`);
  process.exit(1);
});
