import type { RequestHandler } from "express";
import { AppError } from "../errors/AppError.js";
import { User } from "../module/User/user.model.js";
import { USER_STATUSES, type UserRole } from "../module/User/user.validation.js";
import { objectIdSchema } from "../utils/ids.js";
import { verifyAccessToken } from "../utils/jwt.js";
import { getSession } from "../utils/session.js";

export interface AuthenticateDependencies {
  verifyAccessToken: typeof verifyAccessToken;
  getSession: typeof getSession;
  findUser: (userId: string) => Promise<{ role: UserRole; status: string } | null>;
}

const defaultDependencies: AuthenticateDependencies = {
  verifyAccessToken,
  getSession,
  // Tokens from before the Super Admin moved to MongoDB carry a non-ObjectId subject; treat them as unknown users.
  findUser: async (userId) => (objectIdSchema.safeParse(userId).success ? User.findById(userId).select("role status").lean() : null),
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

      // The role is always read from the database, so a role change applies on the next request.
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
