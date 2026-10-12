import { randomBytes } from "node:crypto";
import type { Redis } from "ioredis";
import { sha256 } from "./tokens.js";

// Admin resets have their own kind, so a customer link can never be redeemed on the admin endpoint (or the other way round).
export type OneTimeKind = "verify-email" | "reset-password" | "reset-admin-password";

const tokenKey = (kind: OneTimeKind, token: string): string => `ott:${kind}:${sha256(token)}`;
const latestKey = (kind: OneTimeKind, userId: string): string => `ott:latest:${kind}:${userId}`;

// Emailed links carry a random token; only its hash is stored. Issuing a new one invalidates the previous one.
export async function issueOneTimeToken(redis: Redis, kind: OneTimeKind, userId: string, ttlSec: number): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  const previous = await redis.get(latestKey(kind, userId));
  const pipeline = redis.multi();
  if (previous) pipeline.del(previous);
  pipeline.set(tokenKey(kind, token), userId, "EX", ttlSec).set(latestKey(kind, userId), tokenKey(kind, token), "EX", ttlSec);
  await pipeline.exec();
  return token;
}

// Single use: GETDEL is atomic, so two requests can never both redeem the same link.
export async function consumeOneTimeToken(redis: Redis, kind: OneTimeKind, token: string): Promise<string | null> {
  return redis.getdel(tokenKey(kind, token));
}
