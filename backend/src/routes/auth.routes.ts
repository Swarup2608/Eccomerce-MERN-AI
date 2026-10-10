import { Router } from "express";
import { registerController, loginController, refreshTokenController, logoutController, superAdminLoginController } from "../module/User/auth.controller.js";
import { registerUserSchema, loginUserSchema, verifyEmailSchema, superAdminLoginSchema } from "../module/User/user.validation.js";
import { verifyEmailController } from "../module/User/email-verification.controller.js";
import { validate } from "../middleware/validate.js";
import { authenticate } from "../middleware/authenticate.js";
import { credentialKey, rateLimit } from "../middleware/rateLimit.js";
import { getCurrentUserController } from "../module/User/currentUser.controller.js";

const authRouter = Router();

const loginLimiter = rateLimit({ name: "login", windowSeconds: 15 * 60, max: 10, key: credentialKey });
const superAdminLoginLimiter = rateLimit({ name: "super-admin-login", windowSeconds: 15 * 60, max: 5, key: credentialKey });
const registerLimiter = rateLimit({ name: "register", windowSeconds: 60 * 60, max: 10 });
const refreshLimiter = rateLimit({ name: "refresh", windowSeconds: 60, max: 30 });

authRouter.post("/register", registerLimiter, validate({ body: registerUserSchema }), registerController);
authRouter.post("/verify-email", validate({ body: verifyEmailSchema }), verifyEmailController);
authRouter.post("/login", validate({ body: loginUserSchema }), loginLimiter, loginController);
authRouter.post("/refresh", refreshLimiter, refreshTokenController);
authRouter.post("/logout", logoutController);
authRouter.get("/me", authenticate, getCurrentUserController);
authRouter.post("/super-admin/login", validate({ body: superAdminLoginSchema }), superAdminLoginLimiter, superAdminLoginController);

export default authRouter;
