import type { RequestHandler } from "express";
import { HttpError } from "../lib/http-error.js";
import type { UserRole } from "../modules/users/user.validation.js";

// Runs after `authenticate`. The scope policy already limits who can hold an admin session; this is the explicit,
// per-router check so a route mounted in the wrong place still refuses the wrong role.
export function requireRole(...roles: UserRole[]): RequestHandler {
  const allowed = new Set(roles);
  return (_req, res, next) => {
    const auth = res.locals.auth;
    if (!auth) return next(new HttpError(401, "UNAUTHENTICATED", "Sign in to continue"));
    if (!allowed.has(auth.role)) return next(new HttpError(403, "FORBIDDEN", "You do not have access to this resource"));
    next();
  };
}

// The signed-in user's id; only valid on routes behind `authenticate`.
export function currentUserId(locals: { auth?: { userId: string } }): string {
  if (!locals.auth) throw new HttpError(401, "UNAUTHENTICATED", "Sign in to continue");
  return locals.auth.userId;
}
