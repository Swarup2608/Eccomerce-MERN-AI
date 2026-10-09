import { randomUUID } from "node:crypto";

import { redis } from "../config/redis.js";
import { AppError } from "../errors/AppError.js";

const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;
const SESSION_KEY_PREFIX = "ecommerce:session:";

export interface SessionRecord {
  sessionId: string;
  userId: string;
  refreshTokenId: string;
  createdAt: string;
}

function sessionKey(sessionId: string): string {
  return `${SESSION_KEY_PREFIX}${sessionId}`;
}

export async function createSession( userId: string ): Promise<SessionRecord> {
  const sessionId = randomUUID();
  const refreshTokenId = randomUUID();
  const createdAt = new Date().toISOString();
  const key = sessionKey(sessionId);

  const result = await redis.multi().hset(key, { userId, refreshTokenId, createdAt }).expire(key, SESSION_TTL_SECONDS).exec();

  if (!result || result.some(([error]) => error !== null)) {
    await redis.del(key);
    throw new AppError("Failed to create login session", 500, "SESSION_CREATION_FAILED");
  }

  return { sessionId, userId, refreshTokenId, createdAt };
}

export async function getSession( sessionId: string ): Promise<SessionRecord | null> {
  const key = sessionKey(sessionId);
  const data = await redis.hgetall(key);

  if ( !data.userId || !data.refreshTokenId || !data.createdAt ) {
    return null;
  }

  return { sessionId, userId: data.userId, refreshTokenId: data.refreshTokenId, createdAt: data.createdAt };
}

export async function rotateSessionRefreshToken( sessionId: string, currentTokenId: string, nextTokenId: string ): Promise<boolean> {
  const script = `
    local current = redis.call("HGET", KEYS[1], "refreshTokenId")
    if not current or current ~= ARGV[1] then
      return 0
    end

    redis.call("HSET", KEYS[1], "refreshTokenId", ARGV[2])
    redis.call("EXPIRE", KEYS[1], ARGV[3])
    return 1
  `;

  const result = await redis.eval( script, 1, sessionKey(sessionId), currentTokenId, nextTokenId, SESSION_TTL_SECONDS.toString() );

  return result === 1;
}

export async function revokeSession( sessionId: string ): Promise<void> {
  await redis.del(sessionKey(sessionId));
}
