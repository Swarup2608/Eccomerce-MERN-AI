import type { Request, RequestHandler, Response } from "express";
import { adminResetPasswordSchema, changePasswordSchema, forgotPasswordSchema, loginUserSchema, adminMfaVerifySchema, mfaResendSchema, registerUserSchema, resendVerificationSchema, resetPasswordSchema, setMfaSchema, superAdminLoginSchema, verifyEmailSchema } from "../users/user.validation.js";
import { clearAuthCookies, setAuthCookies } from "./auth.cookies.js";
import type { AuthScope } from "./auth.policy.js";
import { unauthenticated, type AuthResult, type AuthService, type ClientContext } from "./auth.service.js";

export interface AuthController {
  register: RequestHandler;
  verifyEmail: RequestHandler;
  resendVerification: RequestHandler;
  forgotPassword(scope: AuthScope): RequestHandler;
  resetPassword(scope: AuthScope): RequestHandler;
  login: RequestHandler;
  adminLogin: RequestHandler;
  changePassword(scope: AuthScope): RequestHandler;
  setMfa: RequestHandler;
  loginVerify(scope: AuthScope): RequestHandler;
  resendLoginCode(scope: AuthScope): RequestHandler;
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

  const claimsOf = (res: Response) => {
    if (!res.locals.auth) throw unauthenticated();
    return res.locals.auth;
  };

  return {
    // Same neutral answer whether the email was new or already registered.
    register: async (req, res) => {
      await service.register(registerUserSchema.parse(req.body), context(req, "user"));
      res.status(202).json({ status: "verification_sent" });
    },

    verifyEmail: async (req, res) => {
      await service.verifyEmail(verifyEmailSchema.parse(req.body).token, context(req, "user"));
      res.status(204).end();
    },

    // Same neutral answer whether or not an email was sent.
    resendVerification: async (req, res) => {
      await service.resendVerification(resendVerificationSchema.parse(req.body).email, context(req, "user"));
      res.status(202).json({ status: "verification_sent_if_pending" });
    },

    forgotPassword: (scope) => async (req, res) => {
      await service.forgotPassword(scope, forgotPasswordSchema.parse(req.body).email, context(req, scope));
      res.status(202).json({ status: "reset_email_sent_if_account_exists" });
    },

    resetPassword: (scope) => async (req, res) => {
      const input = (scope === "admin" ? adminResetPasswordSchema : resetPasswordSchema).parse(req.body);
      await service.resetPassword(scope, input.token, input.password, context(req, scope));
      clearAuthCookies(res, policies[scope], secureCookies);
      res.status(204).end();
    },

    login: async (req, res) => {
      const input = loginUserSchema.parse(req.body);
      const result = await service.login(input.identifier, input.password, context(req, "user"));
      if ("challengeId" in result) res.status(202).json({ status: "mfa_required", challengeId: result.challengeId });
      else respond(res, "user", 200, result);
    },

    adminLogin: async (req, res) => {
      const input = superAdminLoginSchema.parse(req.body);
      res.status(202).json({ status: "mfa_required", challengeId: (await service.startAdminLogin(input.email, input.password, context(req, "admin"))).challengeId });
    },

    loginVerify: (scope) => async (req, res) => {
      const input = adminMfaVerifySchema.parse(req.body);
      respond(res, scope, 200, await service.completeMfaLogin(scope, input.challengeId, input.code, context(req, scope)));
    },

    resendLoginCode: (scope) => async (req, res) => {
      await service.resendLoginCode(scope, mfaResendSchema.parse(req.body).challengeId);
      res.status(202).json({ status: "code_sent" });
    },

    changePassword: (scope) => async (req, res) => {
      const input = changePasswordSchema.parse(req.body);
      respond(res, scope, 200, await service.changePassword(scope, claimsOf(res), input.currentPassword, input.newPassword, context(req, scope)));
    },

    setMfa: async (req, res) => {
      const input = setMfaSchema.parse(req.body);
      res.json(await service.setMfa(claimsOf(res), input.enabled, input.currentPassword, context(req, "user")));
    },

    refresh: (scope) => async (req, res) => {
      try {
        respond(res, scope, 200, await service.refresh(scope, req.cookies?.[policies[scope].refreshCookie], context(req, scope)));
      } catch (error) {
        clearAuthCookies(res, policies[scope], secureCookies);
        throw error;
      }
    },

    logout: (scope) => async (req, res) => {
      await service.logout(scope, req.cookies?.[policies[scope].refreshCookie], context(req, scope));
      clearAuthCookies(res, policies[scope], secureCookies);
      res.status(204).end();
    },

    logoutAll: (scope) => async (req, res) => {
      await service.logoutAll(scope, claimsOf(res).userId, context(req, scope));
      clearAuthCookies(res, policies[scope], secureCookies);
      res.status(204).end();
    },

    me: (scope) => async (_req, res) => {
      res.json(await service.getCurrentUser(scope, claimsOf(res)));
    },
  };
}
