import type { RequestHandler } from "express";
import { verifyEmailToken } from "./email-verification.service.js";
import type { VerifyEmailInput } from "./user.validation.js";

export const verifyEmailController: RequestHandler = async (req, res) => {
  const { token } = req.body as VerifyEmailInput;

  await verifyEmailToken(token);

  res.status(200).json({
    success: true,
    message: "Email verified successfully. You can now log in.",
  });
};


