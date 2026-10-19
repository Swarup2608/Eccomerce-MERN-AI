import type { IncomingMessage } from "node:http";
import jwt from "jsonwebtoken";
import { config } from "./config.js";

function cookie(header: string | undefined, name: string): string | undefined {
  for (const part of (header ?? "").split(";")) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return undefined;
}

// Verifies the shop's customer access token (same pinned algorithm, issuer and audience as the API). This is a stateless
// check: a session the API revoked still passes until its 15-minute token expires.
export function userIdFrom(req: IncomingMessage): string | null {
  const token = cookie(req.headers.cookie, config.accessCookie);
  if (!token || !config.accessSecret) return null;
  try {
    const p = jwt.verify(token, config.accessSecret, { algorithms: ["HS256"], issuer: "ecommerce-api", audience: "user" });
    return typeof p === "object" && p.type === "access" && typeof p.sub === "string" ? p.sub : null;
  } catch {
    return null;
  }
}
