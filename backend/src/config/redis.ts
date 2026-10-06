import {Redis} from "ioredis";
import { env } from "./env.js";

export const redis = new Redis(env.REDIS_URL, {
    lazyConnect: true,
});

export async function connectRedis(): Promise<void> {
    await redis.connect();
    console.log("Redis connected successfully");
}

redis.on("error", (err: Error) => {
    console.error("Redis connection error:", err);
});

export async function pingRedis(): Promise<string> {
    return await redis.ping();
}

export function isRedisReady(): boolean {
    return redis.status === "ready";
}