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

const cookieNames = (header: string | undefined) =>
  (header ?? "").split(";").map((part) => part.split("=")[0]?.trim()).filter(Boolean);

export type AuthResult = { userId: string } | { reason: string };

// Verifies the shop's customer access token (same pinned algorithm, issuer and audience as the API). This is a stateless
// check: a session the API revoked still passes until its 15-minute token expires. A failure says why (never the token
// itself), so a cookie-name or secret mismatch between the API and the stylist is visible.
export function authenticate(req: IncomingMessage): AuthResult {
  if (!config.accessSecret) return { reason: "the stylist has no ACCESS_TOKEN_SECRET configured" };
  const token = cookie(req.headers.cookie, config.accessCookie);
  if (!token) {
    const names = cookieNames(req.headers.cookie);
    return { reason: names.length ? `no "${config.accessCookie}" cookie (received: ${names.join(", ")})` : "no cookies reached the stylist" };
  }
  try {
    const p = jwt.verify(token, config.accessSecret, { algorithms: ["HS256"], issuer: "ecommerce-api", audience: "user" });
    if (typeof p !== "object" || p.type !== "access" || typeof p.sub !== "string") return { reason: "the cookie is not a customer access token" };
    return { userId: p.sub };
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) return { reason: "the access token has expired" };
    if (err instanceof jwt.JsonWebTokenError && err.message === "invalid signature") return { reason: "the access token was signed with a different ACCESS_TOKEN_SECRET" };
    return { reason: `the access token is invalid (${err instanceof Error ? err.message : String(err)})` };
  }
}
