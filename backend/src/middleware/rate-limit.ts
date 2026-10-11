import { isIPv6 } from "node:net";
import type { RequestHandler } from "express";
import type { Redis } from "ioredis";
import { HttpError } from "../lib/http-error.js";
import type { Logger } from "../lib/logger.js";

export interface RateLimitHit {
  count: number;
  resetMs: number;
}

export interface RateLimitStore {
  increment(key: string, windowMs: number): Promise<RateLimitHit>;
}

// Atomic fixed window: INCR, set the expiry on first hit, and repair a key that somehow lost its TTL.
const FIXED_WINDOW_SCRIPT = `
local count = redis.call("INCR", KEYS[1])
if count == 1 then redis.call("PEXPIRE", KEYS[1], ARGV[1]) end
local ttl = redis.call("PTTL", KEYS[1])
if ttl < 0 then redis.call("PEXPIRE", KEYS[1], ARGV[1]) ttl = tonumber(ARGV[1]) end
return { count, ttl }
`;

export class RedisRateLimitStore implements RateLimitStore {
  constructor(private readonly redis: Redis) {}

  async increment(key: string, windowMs: number): Promise<RateLimitHit> {
    const [count, ttl] = (await this.redis.eval(FIXED_WINDOW_SCRIPT, 1, key, windowMs)) as [number, number];
    return { count, resetMs: ttl };
  }
}

export class MemoryRateLimitStore implements RateLimitStore {
  private readonly hits = new Map<string, { count: number; expiresAt: number }>();

  increment(key: string, windowMs: number): Promise<RateLimitHit> {
    const now = Date.now();
    const current = this.hits.get(key);
    const entry = current && current.expiresAt > now ? current : { count: 0, expiresAt: now + windowMs };
    entry.count += 1;
    this.hits.set(key, entry);
    return Promise.resolve({ count: entry.count, resetMs: entry.expiresAt - now });
  }
}

// Group IPv6 clients by /64, since a single host can rotate through an entire /64 trivially.
export function clientKey(ip: string | undefined): string {
  if (!ip) return "unknown";
  if (ip.startsWith("::ffff:")) return ip.slice(7);
  if (!isIPv6(ip)) return ip;

  const [head = "", tail = ""] = ip.split("::");
  const headParts = head ? head.split(":") : [];
  const tailParts = tail ? tail.split(":") : [];
  const groups = ip.includes("::") ? [...headParts, ...Array<string>(Math.max(0, 8 - headParts.length - tailParts.length)).fill("0"), ...tailParts] : headParts;
  return `${groups.slice(0, 4).map((group) => group.toLowerCase().padStart(4, "0")).join(":")}::/64`;
}

export interface RateLimitOptions {
  store: RateLimitStore;
  windowMs: number;
  max: number;
  prefix: string;
  logger: Logger;
  // Global limits fail open so a Redis blip doesn't take the API down; auth limits should fail closed.
  failOpen?: boolean;
}

export function rateLimit({ store, windowMs, max, prefix, logger, failOpen = true }: RateLimitOptions): RequestHandler {
  return async (req, res, next) => {
    let hit: RateLimitHit;
    try {
      hit = await store.increment(`rl:${prefix}:${clientKey(req.ip)}`, windowMs);
    } catch (error) {
      logger.error("Rate limit store unavailable", { prefix, failOpen, error });
      return failOpen ? next() : next(new HttpError(503, "SERVICE_UNAVAILABLE", "Service temporarily unavailable"));
    }

    const resetSeconds = Math.max(1, Math.ceil(hit.resetMs / 1000));
    res.setHeader("RateLimit-Limit", String(max));
    res.setHeader("RateLimit-Remaining", String(Math.max(0, max - hit.count)));
    res.setHeader("RateLimit-Reset", String(resetSeconds));

    if (hit.count > max) {
      res.setHeader("Retry-After", String(resetSeconds));
      return next(new HttpError(429, "RATE_LIMITED", "Too many requests, please try again later"));
    }
    next();
  };
}
