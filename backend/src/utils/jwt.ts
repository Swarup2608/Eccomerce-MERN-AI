import jwt, { type JwtPayload } from "jsonwebtoken";
import { env } from "../config/env.js";
import { AppError } from "../errors/AppError.js";

const TOKEN_ISSUER = "ecommerce-api";
const TOKEN_AUDIENCE = "ecommerce-client";

const ACCESS_TOKEN_TTL = "15m";
const REFRESH_TOKEN_TTL = "7d";

export interface AccessTokenPayload extends JwtPayload {
  sub: string;
  sid: string;
  type: "access";
}

export interface RefreshTokenPayload extends JwtPayload {
  sub: string;
  sid: string;
  jti: string;
  type: "refresh";
}

export function signAccessToken( userId: string, sessionId: string ): string {
  return jwt.sign({
      sub: userId, sid: sessionId, type: "access",
    }, env.JWT_ACCESS_SECRET, {
      expiresIn: ACCESS_TOKEN_TTL, issuer: TOKEN_ISSUER, audience: TOKEN_AUDIENCE,
    });
}

export function signRefreshToken( userId: string, sessionId: string, tokenId: string ): string {
  return jwt.sign(
    { sub: userId, sid: sessionId, jti: tokenId, type: "refresh" }, 
    env.JWT_REFRESH_SECRET, 
    { expiresIn: REFRESH_TOKEN_TTL, issuer: TOKEN_ISSUER, audience: TOKEN_AUDIENCE });
}

export function verifyAccessToken( token: string ): AccessTokenPayload {
  try {
    const payload = jwt.verify(token, env.JWT_ACCESS_SECRET, { issuer: TOKEN_ISSUER, audience: TOKEN_AUDIENCE });

    if ( typeof payload === "string" || typeof payload.sub !== "string" || typeof payload.sid !== "string" || payload.type !== "access" ) {
      throw new Error("Invalid access token payload");
    }

    return payload as AccessTokenPayload;
  } catch {
    throw new AppError( "Invalid or expired access token.", 401, "INVALID_ACCESS_TOKEN" );
  }
}

export function verifyRefreshToken( token: string ): RefreshTokenPayload {
  try {
    const payload = jwt.verify(token, env.JWT_REFRESH_SECRET, { issuer: TOKEN_ISSUER, audience: TOKEN_AUDIENCE });

    if ( typeof payload === "string" || typeof payload.sub !== "string" || typeof payload.sid !== "string" || typeof payload.jti !== "string" || payload.type !== "refresh" ) {
      throw new Error("Invalid refresh token payload");
    }

    return payload as RefreshTokenPayload;
  } catch {
    throw new AppError( "Invalid or expired refresh token.", 401, "INVALID_REFRESH_TOKEN" );
  }
}