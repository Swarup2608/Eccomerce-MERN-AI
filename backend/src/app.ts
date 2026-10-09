import express, { type Express } from "express";
import cors from "cors";
import helmet from "helmet";

import { isMongoReady } from "./config/mongoose.js";
import { isRedisReady } from "./config/redis.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { requestId } from "./middleware/requestId.js";
import { requestLogger } from "./middleware/requestLogger.js";
import { notFoundHandler } from "./middleware/notFound.js";
import { env } from "./config/env.js";

// Routes
import authRouter from "./routes/auth.routes.js";

export interface AppDependencies {
  isMongoReady: () => boolean;
  isRedisReady: () => boolean;
}

const defaultDependencies: AppDependencies = {
  isMongoReady,
  isRedisReady,
};

export function createApp( dependencies: AppDependencies = defaultDependencies, registerRoutes?: (app: Express) => void, ) {
  const app = express();

  app.use(requestId);
  app.use(requestLogger);

  app.use(helmet());
  app.use(
    cors({
      origin: env.CORS_ORIGIN,
      credentials: true,
    })
  );
  app.use(express.json({ limit: "1mb" }));

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

  app.use("/api/v1/auth", authRouter);
  registerRoutes?.(app);


  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

const app = createApp();

export default app;