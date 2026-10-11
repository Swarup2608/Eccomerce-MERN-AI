import mongoose from "mongoose";
import type { AppConfig } from "../config/env.js";
import type { Logger } from "./logger.js";

// Reject unknown query fields and neutralise `$`-operator injection in filters built from user input.
mongoose.set("strictQuery", true);
mongoose.set("sanitizeFilter", true);

export async function connectMongo(config: AppConfig, logger: Logger): Promise<void> {
  const log = logger.child({ component: "mongo" });
  const { connection } = mongoose;

  connection.on("connected", () => log.info("MongoDB connected"));
  connection.on("disconnected", () => log.warn("MongoDB disconnected"));
  connection.on("reconnected", () => log.info("MongoDB reconnected"));
  connection.on("error", (error: unknown) => log.error("MongoDB error", { error }));

  await mongoose.connect(config.mongodbUri, {
    dbName: config.mongodbDbName,
    appName: "ecommerce-backend",
    autoIndex: !config.isProduction,
    maxPoolSize: 20,
    minPoolSize: 0,
    serverSelectionTimeoutMS: 10_000,
    socketTimeoutMS: 45_000,
    retryWrites: true,
  });
}

export async function pingMongo(): Promise<void> {
  const { db, readyState } = mongoose.connection;
  if (readyState !== mongoose.ConnectionStates.connected || !db) throw new Error("MongoDB not connected");
  await db.admin().ping();
}

export async function disconnectMongo(): Promise<void> {
  await mongoose.disconnect();
}
