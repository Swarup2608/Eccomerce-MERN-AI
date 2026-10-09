import type { RequestHandler } from "express";
import { registerUser, loginUser, refreshUserSession } from "./auth.service.js";
import type { RegisterUserInput, LoginUserInput } from "./user.validation.js";
import { env } from "../../config/env.js";
import { AppError } from "../../errors/AppError.js";
import { verifyRefreshToken } from "../../utils/jwt.js";
import { revokeSession } from "../../utils/session.js";

export const registerController: RequestHandler = async (req, res) => {
  const input = req.body as RegisterUserInput;
  const user = await registerUser(input);

  res.status(201).json({
    success: true,
    message: "Registration successful. Please verify your email.",
    data: { user },
  });
};

const accessCookieOptions = {
  httpOnly: true,
  secure: env.COOKIE_SECURE,
  sameSite: "lax" as const,
  path: "/",
  maxAge: 15 * 60 * 1000,
};

const refreshCookieOptions = {
  httpOnly: true,
  secure: env.COOKIE_SECURE,
  sameSite: "lax" as const,
  path: "/api/v1/auth",
  maxAge: 7 * 24 * 60 * 60 * 1000,
};

export const loginController: RequestHandler = async (req, res) => {
  const input = req.body as LoginUserInput;
  const result = await loginUser(input);

  res.cookie("accessToken", result.accessToken, accessCookieOptions);
  res.cookie("refreshToken", result.refreshToken, refreshCookieOptions);

  res.status(200).json({
    success: true,
    message: "Login successful.",
    data: { user: result.user },
  });
}

export const refreshTokenController: RequestHandler = async (req, res) => {
  const refreshToken = req.cookies?.refreshToken;
  if(typeof refreshToken !== "string" || !refreshToken) {
    throw new AppError("Refresh token is required.", 401, "INVALID_REFRESH_TOKEN");
  }
  const result = await refreshUserSession(refreshToken);

  res.cookie("accessToken", result.accessToken, accessCookieOptions);
  res.cookie("refreshToken", result.refreshToken, refreshCookieOptions);

  res.status(200).json({
    success: true,
    message: "Token refreshed successfully."
  });
}

export const logoutController: RequestHandler = async (req, res, next) => {
  const refreshToken = req.cookies?.refreshToken as string | undefined;

  res.clearCookie("accessToken", accessCookieOptions);
  res.clearCookie("refreshToken", refreshCookieOptions);

  if(refreshToken) {
    let sessionId: string | undefined;
    try{
      sessionId = verifyRefreshToken(refreshToken).sid;
    }
    catch(error) {
      // Ignore errors during token verification
    }
    if(sessionId) {
      try{
        await revokeSession(sessionId); 
      }
      catch(error) {
        next(error);
        return;
      }
    }
  }

  res.status(200).json({
    success: true,
    message: "Logged out successful."
  });
}