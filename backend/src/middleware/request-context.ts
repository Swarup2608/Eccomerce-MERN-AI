import { randomUUID } from "node:crypto";
import type { RequestHandler } from "express";
import type { Logger } from "../lib/logger.js";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Locals {
      requestId: string;
    }
  }
}

const SAFE_REQUEST_ID = /^[A-Za-z0-9-]{8,64}$/;

// Assigns a request id (reusing a well-formed upstream one) and writes one access-log line per request.
export function requestContext(logger: Logger): RequestHandler {
  return (req, res, next) => {
    const incoming = req.get("x-request-id");
    const requestId = incoming && SAFE_REQUEST_ID.test(incoming) ? incoming : randomUUID();
    const startedAt = process.hrtime.bigint();

    res.locals.requestId = requestId;
    res.setHeader("X-Request-Id", requestId);

    res.on("finish", () => {
      const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
      // req.path excludes the query string, which may contain user data.
      logger.info("request", { requestId, method: req.method, path: req.path, status: res.statusCode, durationMs: Math.round(durationMs), ip: req.ip });
    });

    next();
  };
}
