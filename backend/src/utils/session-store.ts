import type { Redis } from "ioredis";
import { HttpError } from "../lib/http-error.js";
import { MAX_SESSION_TTL_SEC, type AuthScope } from "../modules/auth/auth.policy.js";

export interface NewSession {
  userId: string;
  scope: AuthScope;
  // The jti of the one refresh token this session currently accepts.
  refreshTokenId: string;
  userAgent: string;
  ip: string;
}

export interface ActiveSession {
  userId: string;
  scope: AuthScope;
}

export type RotateResult =
  | { status: "rotated"; userId: string; ttlMs: number }
  | { status: "grace"; userId: string; ttlMs: number; tokenId: string }
  | { status: "invalid" }
  | { status: "idle"; userId: string }
  | { status: "reused"; userId: string };

// A just-rotated token may be presented again for this long (second tab, lost response) without being treated as theft.
export const REFRESH_GRACE_MS = 30_000;

const SESSION_KEY_PREFIX = "ecommerce:session:";

const sessionKey = (sessionId: string): string => `${SESSION_KEY_PREFIX}${sessionId}`;
const graceKey = (sessionId: string): string => `${SESSION_KEY_PREFIX}grace:${sessionId}`;
// Index of a user's live sessions, so "sign out everywhere", password changes and suspensions can revoke them all.
const userSessionsKey = (userId: string): string => `${SESSION_KEY_PREFIX}user:${userId}`;

// Atomic compare-and-swap of the refresh token id, so two concurrent refreshes can never both rotate.
// A stale token id inside the grace window gets the already-issued next token back; outside it, the session is destroyed.
// A session not refreshed for longer than the idle limit (ARGV[7]) is destroyed too. Access tokens are short-lived, so an
// active browser refreshes every few minutes and lastUsedAt tracks real activity.
// Every key it touches is declared in KEYS, so it is safe on Redis Cluster.
const ROTATE_SCRIPT = `
local data = redis.call("HMGET", KEYS[1], "refreshTokenId", "scope", "userId", "lastUsedAt")
if not data[1] or data[2] ~= ARGV[1] then return {0} end
if data[4] and tonumber(ARGV[5]) - tonumber(data[4]) > tonumber(ARGV[7]) then
  redis.call("DEL", KEYS[1], KEYS[2])
  return {3, data[3]}
end
if data[1] ~= ARGV[2] then
  local grace = redis.call("GET", KEYS[2])
  if grace then
    local sep = string.find(grace, ":", 1, true)
    if sep and string.sub(grace, 1, sep - 1) == ARGV[2] then
      return {2, data[3], redis.call("PTTL", KEYS[1]), string.sub(grace, sep + 1)} -- the id of the token issued last time, never the token itself
    end
  end
  redis.call("DEL", KEYS[1], KEYS[2])
  return {-1, data[3]}
end
redis.call("HSET", KEYS[1], "refreshTokenId", ARGV[3], "lastUsedAt", ARGV[5])
redis.call("SET", KEYS[2], ARGV[2] .. ":" .. ARGV[4], "PX", ARGV[6])
return {1, data[3], redis.call("PTTL", KEYS[1])}
`;

export async function createSession(redis: Redis, sessionId: string, session: NewSession, ttlSec: number): Promise<void> {
  const now = String(Date.now());
  const result = await redis
    .multi()
    .hset(sessionKey(sessionId), { ...session, createdAt: now, lastUsedAt: now })
    .expire(sessionKey(sessionId), ttlSec)
    .sadd(userSessionsKey(session.userId), sessionId)
    .expire(userSessionsKey(session.userId), MAX_SESSION_TTL_SEC)
    .exec();

  if (!result || result.some(([error]) => error !== null)) {
    await redis.del(sessionKey(sessionId));
    throw new HttpError(500, "SESSION_CREATION_FAILED", "Failed to create login session");
  }
}

export async function rotateSession(redis: Redis, sessionId: string, scope: AuthScope, presentedTokenId: string, nextTokenId: string, idleMs: number): Promise<RotateResult> {
  const result = (await redis.eval(ROTATE_SCRIPT, 2, sessionKey(sessionId), graceKey(sessionId), scope, presentedTokenId, nextTokenId, nextTokenId, String(Date.now()), String(REFRESH_GRACE_MS), String(idleMs))) as [number, string?, number?, string?];
  const [code, userId, ttlMs, graceTokenId] = result;
  if (code === 1 && userId && typeof ttlMs === "number" && ttlMs > 0) return { status: "rotated", userId, ttlMs };
  if (code === 2 && userId && typeof ttlMs === "number" && ttlMs > 0 && graceTokenId) return { status: "grace", userId, ttlMs, tokenId: graceTokenId };
  if ((code === -1 || code === 3) && userId) {
    await redis.srem(userSessionsKey(userId), sessionId);
    return { status: code === 3 ? "idle" : "reused", userId };
  }
  return { status: "invalid" };
}

export async function getSession(redis: Redis, sessionId: string): Promise<ActiveSession | null> {
  const [userId, scope] = await redis.hmget(sessionKey(sessionId), "userId", "scope");
  if (!userId || (scope !== "user" && scope !== "admin")) return null;
  return { userId, scope };
}

export async function revokeSession(redis: Redis, sessionId: string): Promise<void> {
  const userId = await redis.hget(sessionKey(sessionId), "userId");
  const pipeline = redis.multi().del(sessionKey(sessionId), graceKey(sessionId));
  if (userId) pipeline.srem(userSessionsKey(userId), sessionId);
  await pipeline.exec();
}

// Repeats a few times so a session created while we were deleting is still caught.
export async function revokeAllUserSessions(redis: Redis, userId: string): Promise<void> {
  for (let pass = 0; pass < 3; pass += 1) {
    const sessionIds = await redis.smembers(userSessionsKey(userId));
    if (sessionIds.length === 0) return;
    await redis.del(userSessionsKey(userId), ...sessionIds.map(sessionKey), ...sessionIds.map(graceKey));
  }
}
