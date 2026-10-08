import mongoose from "mongoose";
import { env } from "./env.js";

export async function connectMongoose() {
    try {
        await mongoose.connect(env.MONGO_URI);
        console.log("Connected to MongoDB");
    } catch (error) {
        console.error("Failed to connect to MongoDB", error);
        process.exit(1);
    }
}

export function isMongoReady() : boolean {
    return mongoose.connection.readyState === 1;
}

export async function disconnectDb(): Promise<void> {
  await mongoose.disconnect();

  console.log("MongoDB connection closed");
}