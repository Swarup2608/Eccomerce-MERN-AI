import type { CookieOptions, Response } from "express";
import type { ScopePolicy } from "./auth.policy.js";

// HttpOnly: invisible to JavaScript (XSS can't steal it). SameSite=Strict: never sent on cross-site requests (CSRF).
const baseOptions = (secure: boolean, path: string): CookieOptions => ({ httpOnly: true, secure, sameSite: "strict", path });

export function setAuthCookies(res: Response, policy: ScopePolicy, secure: boolean, tokens: { accessToken: string; refreshToken: string; refreshMaxAgeMs: number }): void {
  res.cookie(policy.accessCookie, tokens.accessToken, { ...baseOptions(secure, policy.accessPath), maxAge: policy.accessTtlSec * 1000 });
  res.cookie(policy.refreshCookie, tokens.refreshToken, { ...baseOptions(secure, policy.refreshPath), maxAge: tokens.refreshMaxAgeMs });
}

export function clearAuthCookies(res: Response, policy: ScopePolicy, secure: boolean): void {
  res.clearCookie(policy.accessCookie, baseOptions(secure, policy.accessPath));
  res.clearCookie(policy.refreshCookie, baseOptions(secure, policy.refreshPath));
}
