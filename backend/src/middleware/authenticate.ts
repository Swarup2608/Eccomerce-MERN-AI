import type { RequestHandler } from "express";
import type { AuthScope } from "../modules/auth/auth.policy.js";
import type { AuthService } from "../modules/auth/auth.service.js";
import type { AccessClaims } from "../utils/tokens.js";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Locals {
      auth?: AccessClaims;
    }
  }
}

// Guards a route for one scope: reads that scope's access cookie and attaches the verified claims to res.locals.auth.
export function authenticate(scope: AuthScope, service: AuthService): RequestHandler {
  const cookieName = service.policies[scope].accessCookie;
  return async (req, res, next) => {
    res.locals.auth = await service.authenticate(scope, req.cookies?.[cookieName]);
    next();
  };
}
