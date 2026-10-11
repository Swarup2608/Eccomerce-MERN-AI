import type { Redis } from "ioredis";
import { MAX_SESSION_TTL_SEC, type AuthScope } from "../modules/auth/auth.policy.js";

export interface NewSession {
  userId: string;
  scope: AuthScope;
  refreshHash: string;
  userAgent: string;
  ip: string;
}

export interface ActiveSession {
  userId: string;
  scope: AuthScope;
}

export type RotateResult = { status: "rotated"; userId: string; ttlMs: number } | { status: "invalid" } | { status: "reused" };

const sessionKey = (sessionId: string): string => `sess:${sessionId}`;
const userSessionsKey = (userId: string): string => `usess:${userId}`;

// Atomic compare-and-swap of the refresh hash, so two concurrent refreshes can never both succeed.
// A hash mismatch means an already-rotated token was replayed (likely stolen): the session is destroyed.
const ROTATE_SCRIPT = `
local data = redis.call("HMGET", KEYS[1], "refreshHash", "scope", "userId")
if not data[1] or data[2] ~= ARGV[1] then return {0} end
if data[1] ~= ARGV[2] then
  redis.call("DEL", KEYS[1])
  redis.call("SREM", KEYS[2] .. data[3], ARGV[4])
  return {-1}
end
redis.call("HSET", KEYS[1], "refreshHash", ARGV[3], "lastUsedAt", ARGV[5])
return {1, data[3], redis.call("PTTL", KEYS[1])}
`;

export async function createSession(redis: Redis, sessionId: string, session: NewSession, ttlSec: number): Promise<void> {
  const now = String(Date.now());
  await redis
    .multi()
    .hset(sessionKey(sessionId), { ...session, createdAt: now, lastUsedAt: now })
    .expire(sessionKey(sessionId), ttlSec)
    .sadd(userSessionsKey(session.userId), sessionId)
    .expire(userSessionsKey(session.userId), MAX_SESSION_TTL_SEC)
    .exec();
}

export async function rotateSession(redis: Redis, sessionId: string, scope: AuthScope, presentedHash: string, nextHash: string): Promise<RotateResult> {
  const result = (await redis.eval(ROTATE_SCRIPT, 2, sessionKey(sessionId), "usess:", scope, presentedHash, nextHash, sessionId, String(Date.now()))) as [number, string?, number?];
  if (result[0] === 1 && result[1] && typeof result[2] === "number" && result[2] > 0) return { status: "rotated", userId: result[1], ttlMs: result[2] };
  return result[0] === -1 ? { status: "reused" } : { status: "invalid" };
}

export async function getSession(redis: Redis, sessionId: string): Promise<ActiveSession | null> {
  const [userId, scope] = await redis.hmget(sessionKey(sessionId), "userId", "scope");
  if (!userId || (scope !== "user" && scope !== "admin")) return null;
  return { userId, scope };
}

export async function revokeSession(redis: Redis, sessionId: string): Promise<void> {
  const userId = await redis.hget(sessionKey(sessionId), "userId");
  const pipeline = redis.multi().del(sessionKey(sessionId));
  if (userId) pipeline.srem(userSessionsKey(userId), sessionId);
  await pipeline.exec();
}

export async function revokeAllUserSessions(redis: Redis, userId: string): Promise<void> {
  const sessionIds = await redis.smembers(userSessionsKey(userId));
  await redis.del(userSessionsKey(userId), ...sessionIds.map(sessionKey));
}
