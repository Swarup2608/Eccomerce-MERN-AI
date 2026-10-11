import type { RequestHandler } from "express";
import { HttpError } from "../lib/http-error.js";

const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"]);
const MAX_DEPTH = 20;

function findUnsafeKey(value: unknown, depth = 0): string | undefined {
  if (value === null || typeof value !== "object") return undefined;
  if (depth > MAX_DEPTH) return "(nesting too deep)";

  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_KEYS.has(key) || key.startsWith("$") || key.includes(".")) return key;
    const nested = findUnsafeKey(child, depth + 1);
    if (nested !== undefined) return nested;
  }
  return undefined;
}

// Blocks MongoDB operator injection (`$gt`, `$where`, dotted paths) and prototype-pollution keys.
// Request bodies are rejected outright rather than silently rewritten.
export const rejectUnsafeKeys: RequestHandler = (req, _res, next) => {
  const unsafeKey = findUnsafeKey(req.body) ?? findUnsafeKey(req.query);
  if (unsafeKey !== undefined) return next(new HttpError(400, "UNSAFE_INPUT", "Request contains a forbidden key"));
  next();
};
