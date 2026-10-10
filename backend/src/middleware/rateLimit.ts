import type { Request, RequestHandler } from "express";
import { redis } from "../config/redis.js";
import { AppError } from "../errors/AppError.js";
import { logger } from "../utils/logger.js";

interface RateLimitOptions {
    // Unique per limiter, e.g. "login".
    name: string;
    windowSeconds: number;
    max: number;
    key?: (req: Request) => string;
}

const KEY_PREFIX = "ecommerce:ratelimit:";

// Fixed-window limiter backed by Redis so limits hold across API instances.
// If Redis is unavailable the request is allowed and the failure is logged:
// availability matters more here than strict limiting.
export function rateLimit(options: RateLimitOptions): RequestHandler {
    return async (req, res, next) => {
        if (redis.status !== "ready") {
            return next();
        }

        const identity = options.key?.(req) ?? req.ip ?? "unknown";
        const key = `${KEY_PREFIX}${options.name}:${identity}`;

        try {
            const [[incrError, count], [, ttl]] = (await redis.multi().incr(key).ttl(key).exec()) as [[Error | null, number], [Error | null, number]];

            if (incrError) {
                return next();
            }
            if (ttl < 0) {
                await redis.expire(key, options.windowSeconds);
            }

            const remaining = Math.max(options.max - count, 0);
            res.setHeader("RateLimit-Limit", options.max);
            res.setHeader("RateLimit-Remaining", remaining);

            if (count > options.max) {
                const retryAfter = ttl > 0 ? ttl : options.windowSeconds;
                res.setHeader("Retry-After", retryAfter);
                return next(new AppError("Too many requests. Please try again later.", 429, "RATE_LIMITED"));
            }

            return next();
        } catch (error) {
            logger.error("Rate limiter failed", { name: options.name, message: error instanceof Error ? error.message : String(error) });
            return next();
        }
    };
}

// Login limiter keyed by IP plus the submitted identifier, so one attacker cannot
// lock every account and one account cannot be brute-forced from many IPs cheaply.
export function credentialKey(req: Request): string {
    const body = req.body as { identifier?: unknown; email?: unknown } | undefined;
    const identifier = typeof body?.identifier === "string" ? body.identifier : typeof body?.email === "string" ? body.email : "";
    return `${req.ip ?? "unknown"}:${identifier.trim().toLowerCase()}`;
}
