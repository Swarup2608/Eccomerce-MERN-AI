import { createHash, randomBytes } from "node:crypto";
import jwt from "jsonwebtoken";
import { isUserRole, type UserRole } from "../modules/users/user.validation.js";
import type { AuthScope } from "../modules/auth/auth.policy.js";

const ISSUER = "ecommerce-api";
// "<sessionId>.<secret>": 16 random bytes + 32 random bytes, base64url encoded.
const REFRESH_TOKEN_PATTERN = /^([A-Za-z0-9_-]{22})\.([A-Za-z0-9_-]{43})$/;

export interface AccessClaims {
  userId: string;
  role: UserRole;
  sessionId: string;
  scope: AuthScope;
}

export function signAccessToken(claims: AccessClaims, secret: string, ttlSec: number): string {
  return jwt.sign({ sid: claims.sessionId, role: claims.role }, secret, { algorithm: "HS256", expiresIn: ttlSec, issuer: ISSUER, audience: claims.scope, subject: claims.userId });
}

// Pins the algorithm, issuer and audience so a customer token can never pass as an admin token.
export function verifyAccessToken(token: string, secret: string, scope: AuthScope): AccessClaims {
  const payload = jwt.verify(token, secret, { algorithms: ["HS256"], issuer: ISSUER, audience: scope });
  if (typeof payload === "string" || typeof payload.sub !== "string" || typeof payload.sid !== "string" || !isUserRole(payload.role)) {
    throw new jwt.JsonWebTokenError("Malformed access token");
  }
  return { userId: payload.sub, role: payload.role, sessionId: payload.sid, scope };
}

export const isTokenExpiredError = (error: unknown): boolean => error instanceof jwt.TokenExpiredError;

export const newSessionId = (): string => randomBytes(16).toString("base64url");

export const newRefreshSecret = (): string => randomBytes(32).toString("base64url");

export const formatRefreshToken = (sessionId: string, secret: string): string => `${sessionId}.${secret}`;

export function parseRefreshToken(value: unknown): { sessionId: string; secret: string } | null {
  if (typeof value !== "string") return null;
  const match = REFRESH_TOKEN_PATTERN.exec(value);
  return match?.[1] && match[2] ? { sessionId: match[1], secret: match[2] } : null;
}

// Only hashes are stored, so a leaked Redis snapshot cannot be replayed as refresh tokens.
export const sha256 = (value: string): string => createHash("sha256").update(value).digest("hex");
