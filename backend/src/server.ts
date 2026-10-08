import type { Server } from "http";

import app from "./app.js";

import { env } from "./config/env.js";
import { connectMongoose, disconnectDb } from "./config/mongoose.js";
import { connectRedis, redis } from "./config/redis.js";

let server: Server | undefined;

async function bootstrap() : Promise<void> {
    await connectMongoose();
    await connectRedis();
    server = app.listen(env.PORT,()=>{
        console.log(`Server is running on port ${env.PORT}`);
    });
}

async function shutdown(signal: string): Promise<void> {
  console.log(`Received ${signal}. Shutting down...`);

  if (server) {
    await new Promise<void>((resolve) => {
      server?.close(() => {
        console.log("HTTP server closed");
        resolve();
      });
    });
  }

  await disconnectDb();
  const redisQuitResult = await redis.quit();
  console.log("Redis connection closed : ", redisQuitResult);

  process.exit(0);
}

process.on("SIGTERM", () => {
  void shutdown("SIGTERM");
});

process.on("SIGINT", () => {
  void shutdown("SIGINT");
});

bootstrap().catch((error: unknown) => {
  console.error("Failed to start server", error);
  process.exit(1);
});