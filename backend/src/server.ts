
import type { Server } from "node:http";

import app from "./app.js";
import { env } from "./config/env.js";
import { connectMongoose, disconnectDb } from "./config/mongoose.js";
import { connectRedis, redis } from "./config/redis.js";
import { logger } from "./utils/logger.js";

let server: Server | undefined;
let isShuttingDown = false;

async function bootstrap(): Promise<void> {
  await connectMongoose();
  await connectRedis();

  server = app.listen(env.PORT, () => {
    logger.info("HTTP server started", {
      port: env.PORT,
      environment: env.NODE_ENV,
    });
  });
}

async function shutdown(signal: string): Promise<void> {
  if (isShuttingDown) {
    return;
  }

  isShuttingDown = true;

  logger.info("Shutdown started", { signal });

  try {
    if (server) {
      await new Promise<void>((resolve, reject) => {
        server!.close((error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        });
      });

      logger.info("HTTP server closed");
    }

    await disconnectDb();

    if (redis.status !== "end") {
      await redis.quit();
      logger.info("Redis connection closed");
    }

    logger.info("Shutdown completed");

    process.exitCode = 0;
  } catch {
    logger.error("Graceful shutdown failed");
    process.exitCode = 1;
  }
}

process.on("SIGTERM", () => {
  void shutdown("SIGTERM");
});

process.on("SIGINT", () => {
  void shutdown("SIGINT");
});

bootstrap().catch(() => {
  logger.error("Server startup failed");
  process.exitCode = 1;
});
