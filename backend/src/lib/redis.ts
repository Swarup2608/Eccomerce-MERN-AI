import { Redis } from "ioredis";
import type { AppConfig } from "../config/env.js";
import type { Logger } from "./logger.js";

export function createRedisClient(config: AppConfig, logger: Logger): Redis {
  const log = logger.child({ component: "redis" });

  if (config.isProduction && !config.redisUrl.startsWith("rediss://")) {
    log.warn("REDIS_URL is not using TLS (rediss://); traffic to Redis is unencrypted");
  }

  const client = new Redis(config.redisUrl, {
    lazyConnect: true,
    connectionName: "ecommerce-backend",
    connectTimeout: 10_000,
    maxRetriesPerRequest: 2,
    // Fail fast while disconnected instead of queueing requests in memory.
    enableOfflineQueue: false,
    retryStrategy: (attempt) => Math.min(attempt * 200, 5_000),
  });

  // Log the message only; the error object can carry the connection string.
  client.on("error", (error: Error) => log.error("Redis error", { message: error.message }));
  client.on("ready", () => log.info("Redis ready"));
  client.on("end", () => log.warn("Redis connection closed"));

  return client;
}

export async function pingRedis(client: Redis): Promise<void> {
  const reply = await client.ping();
  if (reply !== "PONG") throw new Error("Unexpected Redis PING reply");
}
