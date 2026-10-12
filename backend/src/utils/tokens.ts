import { createHash, randomUUID } from "node:crypto";
import jwt from "jsonwebtoken";
import { isUserRole, type UserRole } from "../modules/users/user.validation.js";
import type { AuthScope } from "../modules/auth/auth.policy.js";

const ISSUER = "ecommerce-api";

export interface AccessClaims {
  userId: string;
  role: UserRole;
  sessionId: string;
  scope: AuthScope;
}

export interface RefreshClaims {
  userId: string;
  sessionId: string;
  // Identifies this one refresh token; the session in Redis only accepts the latest.
  tokenId: string;
}

export const newSessionId = (): string => randomUUID();
export const newRefreshTokenId = (): string => randomUUID();

// Both token kinds are signed with the scope's secret and carry a `type` claim, so a refresh token can never be used
// as an access token (or the other way round). The audience is the scope, so a customer token can't pass as an admin one.
export function signAccessToken(claims: AccessClaims, secret: string, ttlSec: number): string {
  return jwt.sign({ sid: claims.sessionId, role: claims.role, type: "access" }, secret, { algorithm: "HS256", expiresIn: ttlSec, issuer: ISSUER, audience: claims.scope, subject: claims.userId });
}

export function signRefreshToken(claims: RefreshClaims & { scope: AuthScope }, secret: string, ttlSec: number): string {
  return jwt.sign({ sid: claims.sessionId, jti: claims.tokenId, type: "refresh" }, secret, { algorithm: "HS256", expiresIn: ttlSec, issuer: ISSUER, audience: claims.scope, subject: claims.userId });
}

// Pins the algorithm, issuer and audience.
export function verifyAccessToken(token: string, secret: string, scope: AuthScope): AccessClaims {
  const payload = jwt.verify(token, secret, { algorithms: ["HS256"], issuer: ISSUER, audience: scope });
  if (typeof payload === "string" || payload.type !== "access" || typeof payload.sub !== "string" || typeof payload.sid !== "string" || !isUserRole(payload.role)) {
    throw new jwt.JsonWebTokenError("Malformed access token");
  }
  return { userId: payload.sub, role: payload.role, sessionId: payload.sid, scope };
}

// `ignoreExpiration` lets an expired token still identify its session, so signing out revokes it instead of leaving it behind.
export function verifyRefreshToken(token: string, secret: string, scope: AuthScope, options: { ignoreExpiration?: boolean } = {}): RefreshClaims {
  const payload = jwt.verify(token, secret, { algorithms: ["HS256"], issuer: ISSUER, audience: scope, ...options });
  if (typeof payload === "string" || payload.type !== "refresh" || typeof payload.sub !== "string" || typeof payload.sid !== "string" || typeof payload.jti !== "string") {
    throw new jwt.JsonWebTokenError("Malformed refresh token");
  }
  return { userId: payload.sub, sessionId: payload.sid, tokenId: payload.jti };
}

export const isTokenExpiredError = (error: unknown): boolean => error instanceof jwt.TokenExpiredError;

export const sha256 = (value: string): string => createHash("sha256").update(value).digest("hex");
