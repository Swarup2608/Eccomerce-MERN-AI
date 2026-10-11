import type { Request, RequestHandler, Response } from "express";
import { loginUserSchema, registerUserSchema, superAdminLoginSchema } from "../users/user.validation.js";
import { clearAuthCookies, setAuthCookies } from "./auth.cookies.js";
import type { AuthScope } from "./auth.policy.js";
import { unauthenticated, type AuthResult, type AuthService, type ClientContext } from "./auth.service.js";

export interface AuthController {
  register: RequestHandler;
  login: RequestHandler;
  adminLogin: RequestHandler;
  refresh(scope: AuthScope): RequestHandler;
  logout(scope: AuthScope): RequestHandler;
  logoutAll(scope: AuthScope): RequestHandler;
  me(scope: AuthScope): RequestHandler;
}

export function createAuthController(service: AuthService, secureCookies: boolean): AuthController {
  const { policies } = service;

  const context = (req: Request, scope: AuthScope): ClientContext => ({ userAgent: req.get("user-agent") ?? "", ip: req.ip ?? "", currentRefreshToken: req.cookies?.[policies[scope].refreshCookie] });

  // Tokens only ever travel in HttpOnly cookies; the JSON body carries the public user profile.
  const respond = (res: Response, scope: AuthScope, status: number, result: AuthResult): void => {
    setAuthCookies(res, policies[scope], secureCookies, result.tokens);
    res.status(status).json({ user: result.user });
  };

  const currentUserId = (res: Response): string => {
    if (!res.locals.auth) throw unauthenticated();
    return res.locals.auth.userId;
  };

  return {
    register: async (req, res) => {
      const input = registerUserSchema.parse(req.body);
      respond(res, "user", 201, await service.register(input, context(req, "user")));
    },

    login: async (req, res) => {
      const input = loginUserSchema.parse(req.body);
      respond(res, "user", 200, await service.login("user", input.identifier, input.password, context(req, "user")));
    },

    adminLogin: async (req, res) => {
      const input = superAdminLoginSchema.parse(req.body);
      respond(res, "admin", 200, await service.login("admin", input.email, input.password, context(req, "admin")));
    },

    refresh: (scope) => async (req, res) => {
      try {
        respond(res, scope, 200, await service.refresh(scope, req.cookies?.[policies[scope].refreshCookie]));
      } catch (error) {
        clearAuthCookies(res, policies[scope], secureCookies);
        throw error;
      }
    },

    logout: (scope) => async (req, res) => {
      await service.logout(req.cookies?.[policies[scope].refreshCookie]);
      clearAuthCookies(res, policies[scope], secureCookies);
      res.status(204).end();
    },

    logoutAll: (scope) => async (_req, res) => {
      await service.logoutAll(currentUserId(res));
      clearAuthCookies(res, policies[scope], secureCookies);
      res.status(204).end();
    },

    me: (scope) => async (_req, res) => {
      res.json({ user: await service.getCurrentUser(scope, currentUserId(res)) });
    },
  };
}
