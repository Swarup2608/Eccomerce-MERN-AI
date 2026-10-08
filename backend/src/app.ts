import express from "express";

import { isMongoReady } from "./config/mongoose.js";
import { isRedisReady } from "./config/redis.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { requestId } from "./middleware/requestId.js";
import { requestLogger } from "./middleware/requestLogger.js";

export interface AppDependencies {
  isMongoReady: () => boolean;
  isRedisReady: () => boolean;
}

const defaultDependencies: AppDependencies = {
  isMongoReady,
  isRedisReady,
};

export function createApp( dependencies: AppDependencies = defaultDependencies) {
  const app = express();

  app.use(requestId);
  app.use(requestLogger);
  app.use(express.json());

  app.get("/api/v1/health", (_req, res) => {
    res.status(200).json({
      success: true,
      message: "API is healthy",
    });
  });

  app.get("/api/v1/ready", (_req, res) => {
    const mongoReady = dependencies.isMongoReady();
    const redisReady = dependencies.isRedisReady();

    const ready = mongoReady && redisReady;

    if (!ready) {
      return res.status(503).json({
        success: false,
        message: "API is not ready",
        dependencies: {
          mongodb: mongoReady,
          redis: redisReady,
        },
      });
    }

    return res.status(200).json({
      success: true,
      message: "API is ready",
      dependencies: {
        mongodb: true,
        redis: true,
      },
    });
  });

  app.use(errorHandler);

  return app;
}

const app = createApp();

export default app;