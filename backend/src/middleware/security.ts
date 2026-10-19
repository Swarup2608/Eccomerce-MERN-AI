import cors from "cors";
import * as helmetModule from "helmet";
import type { RequestHandler } from "express";
import { HttpError } from "../lib/http-error.js";

// Namespace import + .default is callable under both ESM and CommonJS type resolution (Vercel's builder uses the latter).
const helmet = helmetModule.default;

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

// The API only returns JSON, so lock everything down: no framing, no scripts, no referrers.
export const securityHeaders: RequestHandler = helmet({
  contentSecurityPolicy: { useDefaults: false, directives: { defaultSrc: ["'none'"], baseUri: ["'none'"], formAction: ["'none'"], frameAncestors: ["'none'"] } },
  crossOriginResourcePolicy: { policy: "same-origin" },
  referrerPolicy: { policy: "no-referrer" },
  strictTransportSecurity: { maxAge: 63_072_000, includeSubDomains: true, preload: true },
});

// API responses may carry user data; never let browsers or shared proxies cache them.
export const noStore: RequestHandler = (_req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  next();
};

export function corsPolicy(allowedOrigins: readonly string[]): RequestHandler {
  const allowed = new Set(allowedOrigins);
  return cors({
    origin: (origin, callback) => callback(null, origin !== undefined && allowed.has(origin)),
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
    allowedHeaders: ["Content-Type", "X-Request-Id"],
    exposedHeaders: ["X-Request-Id", "RateLimit-Limit", "RateLimit-Remaining", "RateLimit-Reset", "Retry-After"],
    maxAge: 600,
    optionsSuccessStatus: 204,
  });
}

// CORS only hides responses; it does not stop a cross-site form from sending a state-changing request.
// Rejecting unknown Origins on unsafe methods closes that CSRF gap before any handler runs.
export function originGuard(allowedOrigins: readonly string[]): RequestHandler {
  const allowed = new Set(allowedOrigins);
  return (req, _res, next) => {
    const origin = req.get("origin");
    if (SAFE_METHODS.has(req.method) || origin === undefined || allowed.has(origin)) return next();
    next(new HttpError(403, "ORIGIN_NOT_ALLOWED", "Origin not allowed"));
  };
}

// Optional network control for the admin API: when ADMIN_ALLOWED_IPS is set, nobody else can even reach the login.
export function adminIpGuard(allowedIps: readonly string[], onBlocked: (ip: string) => void): RequestHandler {
  const allowed = new Set(allowedIps);
  return (req, _res, next) => {
    if (allowed.size === 0 || (req.ip !== undefined && allowed.has(req.ip.replace(/^::ffff:/, "")))) return next();
    onBlocked(req.ip ?? "unknown");
    next(new HttpError(403, "IP_NOT_ALLOWED", "Access from this network is not allowed"));
  };
}
