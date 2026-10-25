import type { CookieOptions, Response } from "express";
import type { ScopePolicy } from "./auth.policy.js";

// HttpOnly: invisible to JavaScript (XSS can't steal it). SameSite=Strict: never sent on cross-site requests (CSRF).
const baseOptions = (secure: boolean, path: string): CookieOptions => ({ httpOnly: true, secure, sameSite: "strict", path });

const accessOptions = (secure: boolean, policy: ScopePolicy): CookieOptions => ({ ...baseOptions(secure, policy.accessPath), ...(policy.accessDomain && { domain: policy.accessDomain }) });

// A host-only access cookie left from before accessDomain was set has the same name and path, and the browser would send
// both; clearing it keeps the API and the stylist reading the same token.
const clearHostOnlyAccess = (res: Response, policy: ScopePolicy, secure: boolean): void => {
  if (policy.accessDomain) res.clearCookie(policy.accessCookie, baseOptions(secure, policy.accessPath));
};

export function setAuthCookies(res: Response, policy: ScopePolicy, secure: boolean, tokens: { accessToken: string; refreshToken: string; refreshMaxAgeMs: number }): void {
  clearHostOnlyAccess(res, policy, secure);
  res.cookie(policy.accessCookie, tokens.accessToken, { ...accessOptions(secure, policy), maxAge: policy.accessTtlSec * 1000 });
  res.cookie(policy.refreshCookie, tokens.refreshToken, { ...baseOptions(secure, policy.refreshPath), maxAge: tokens.refreshMaxAgeMs });
}

export function clearAuthCookies(res: Response, policy: ScopePolicy, secure: boolean): void {
  clearHostOnlyAccess(res, policy, secure);
  res.clearCookie(policy.accessCookie, accessOptions(secure, policy));
  res.clearCookie(policy.refreshCookie, baseOptions(secure, policy.refreshPath));
}
