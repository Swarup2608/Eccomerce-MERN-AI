import type { RequestHandler } from "express";
import { registerUser } from "./auth.service.js";
import type { RegisterUserInput } from "./user.validation.js";


export const registerController: RequestHandler = async (req, res) => {
  const input = req.body as RegisterUserInput;
  const user = await registerUser(input);

  res.status(201).json({
    success: true,
    message: "Registration successful. Please verify your email.",
    data: { user },
  });
};