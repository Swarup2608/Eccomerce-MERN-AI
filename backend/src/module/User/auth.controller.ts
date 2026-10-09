import type { RequestHandler } from "express";
import { registerUser, loginUser } from "./auth.service.js";
import type { RegisterUserInput, LoginUserInput } from "./user.validation.js";
import { env } from "../../config/env.js";


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