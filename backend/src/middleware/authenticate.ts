import type { RequestHandler } from "express";
import { env } from "../config/env.js";
import { AppError } from "../errors/AppError.js";
import { SUPER_ADMIN_IDENTITY_ID } from "../module/User/super-admin.constants.js";
import { User } from "../module/User/user.model.js";
import { USER_ROLES, USER_STATUSES, type UserRole } from "../module/User/user.validation.js";
import { verifyAccessToken } from "../utils/jwt.js";
import { getSession } from "../utils/session.js";

export interface AuthenticateDependencies {
  verifyAccessToken: typeof verifyAccessToken;
  getSession: typeof getSession;
  findUser: (userId: string) => Promise<{ role: UserRole; status: string } | null>;
  isSuperAdminConfigured: () => boolean;
}

const defaultDependencies: AuthenticateDependencies = {
  verifyAccessToken,
  getSession,
  findUser: async (userId) => User.findById(userId).select("role status").lean(),
  isSuperAdminConfigured: () => Boolean(env.SUPER_ADMIN_EMAIL && env.SUPER_ADMIN_PASSWORD_HASH),
};

export function createAuthenticate(dependencies: AuthenticateDependencies = defaultDependencies): RequestHandler {
  return async (req, res, next) => {
    const accessToken = req.cookies?.accessToken;

    if (typeof accessToken !== "string" || !accessToken) {
      return next(new AppError("Access token is required.", 401, "AUTHENTICATION_REQUIRED"));
    }

    try {
      const payload = dependencies.verifyAccessToken(accessToken);

      // A valid signature is not enough: the session must still exist in Redis,
      // so logout and revocation take effect immediately instead of at token expiry.
      const session = await dependencies.getSession(payload.sid);

      if (!session || session.userId !== payload.sub) {
        return next(new AppError("Your session has ended. Please sign in again.", 401, "SESSION_REVOKED"));
      }

      if (payload.sub === SUPER_ADMIN_IDENTITY_ID) {
        if (!dependencies.isSuperAdminConfigured()) {
          return next(new AppError("Super Admin login is not configured.", 401, "ACCOUNT_INACTIVE"));
        }

        res.locals.user = {
          userId: SUPER_ADMIN_IDENTITY_ID,
          sessionId: payload.sid,
          role: USER_ROLES.SUPER_ADMIN,
        };

        return next();
      }

      const user = await dependencies.findUser(payload.sub);

      if (!user || user.status !== USER_STATUSES.ACTIVE) {
        return next(new AppError("Your account is not active.", 401, "ACCOUNT_INACTIVE"));
      }

      res.locals.user = {
        userId: payload.sub,
        sessionId: payload.sid,
        role: user.role,
      };

      return next();
    } catch (error) {
      return next(error);
    }
  };
}

export const authenticate: RequestHandler = createAuthenticate();
