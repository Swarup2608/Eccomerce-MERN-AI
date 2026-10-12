import { USER_ROLES, type UserRole } from "../users/user.validation.js";

export type AuthScope = "user" | "admin";

export interface ScopePolicy {
  scope: AuthScope;
  allowedRoles: readonly UserRole[];
  accessTtlSec: number;
  // Absolute session lifetime: rotating the refresh token never extends it.
  sessionTtlSec: number;
  // Inactivity limit: a session that has not been refreshed for this long is ended at its next refresh.
  idleTtlSec: number;
  accessCookie: string;
  refreshCookie: string;
  // Narrow cookie paths keep each token off requests that don't need it.
  accessPath: string;
  refreshPath: string;
}

export const MAX_SESSION_TTL_SEC = 30 * 24 * 60 * 60;

// The __Secure- prefix makes browsers refuse the cookie unless it was set over HTTPS with the Secure flag.
export function scopePolicies(secureCookies: boolean): Record<AuthScope, ScopePolicy> {
  const prefix = secureCookies ? "__Secure-" : "";
  return {
    user: {
      scope: "user",
      allowedRoles: [USER_ROLES.USER],
      accessTtlSec: 15 * 60,
      sessionTtlSec: MAX_SESSION_TTL_SEC,
      idleTtlSec: 24 * 60 * 60,
      accessCookie: `${prefix}sf_access`,
      refreshCookie: `${prefix}sf_refresh`,
      accessPath: "/api/v1",
      refreshPath: "/api/v1/auth",
    },
    admin: {
      scope: "admin",
      allowedRoles: [USER_ROLES.ADMIN],
      accessTtlSec: 10 * 60,
      sessionTtlSec: 12 * 60 * 60,
      idleTtlSec: 3 * 60 * 60,
      accessCookie: `${prefix}adm_access`,
      refreshCookie: `${prefix}adm_refresh`,
      accessPath: "/api/v1/admin",
      refreshPath: "/api/v1/admin/auth",
    },
  };
}
