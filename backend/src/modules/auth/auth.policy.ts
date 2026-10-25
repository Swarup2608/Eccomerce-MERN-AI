import { USER_ROLES, type UserRole } from "../users/user.validation.js";

export type AuthScope = "user" | "admin";
type NodeEnv = "development" | "test" | "production";

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
  // Set only to share the access cookie with sibling subdomains (the stylist); the refresh cookie stays host-only.
  accessDomain?: string;
}

export const MAX_SESSION_TTL_SEC = 30 * 24 * 60 * 60;

// The __Secure- prefix makes browsers refuse the cookie unless it was set over HTTPS with the Secure flag.
// Names say which site set them: localhost when NODE_ENV=development, else ecommerce.mnsswarup.dev / admin.ecommerce.mnsswarup.dev.
// userCookieDomain widens only the shopper access cookie; admin cookies always stay on the API host.
export function scopePolicies(secureCookies: boolean, env: NodeEnv, userCookieDomain?: string): Record<AuthScope, ScopePolicy> {
  const prefix = secureCookies ? "__Secure-" : "";
  const isLocal = env === "development";
  const user = `${prefix}${isLocal ? "localhost-user" : "ecommerce-user"}`;
  const admin = `${prefix}${isLocal ? "localhost-admin" : "admin-ecommerce"}`;
  return {
    user: {
      scope: "user",
      allowedRoles: [USER_ROLES.USER],
      accessTtlSec: 15 * 60,
      sessionTtlSec: MAX_SESSION_TTL_SEC,
      idleTtlSec: 24 * 60 * 60,
      accessCookie: `${user}-access-token`,
      refreshCookie: `${user}-refresh-token`,
      accessPath: "/api/v1",
      refreshPath: "/api/v1/auth",
      ...(userCookieDomain && { accessDomain: userCookieDomain }),
    },
    admin: {
      scope: "admin",
      allowedRoles: [USER_ROLES.ADMIN],
      accessTtlSec: 10 * 60,
      sessionTtlSec: 12 * 60 * 60,
      idleTtlSec: 3 * 60 * 60,
      accessCookie: `${admin}-access-token`,
      refreshCookie: `${admin}-refresh-token`,
      accessPath: "/api/v1/admin",
      refreshPath: "/api/v1/admin/auth",
    },
  };
}
