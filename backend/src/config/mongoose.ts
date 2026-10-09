import mongoose from "mongoose";
import { env } from "./env.js";
import { logger } from "../utils/logger.js";

export async function connectMongoose() {
    try {
        await mongoose.connect(env.MONGO_URI);
        logger.info("Connected to MongoDB");
    } catch (error) {
        logger.error("Failed to connect to MongoDB: " + error);
        process.exit(1);
    }
}

export function isMongoReady() : boolean {
    return mongoose.connection.readyState === 1;
}

export async function disconnectDb(): Promise<void> {
  await mongoose.disconnect();

  logger.info("MongoDB connection closed");
}