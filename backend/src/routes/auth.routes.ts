import { Router } from "express";
import { registerController, loginController, refreshTokenController, logoutController } from "../module/User/auth.controller.js";
import { registerUserSchema, loginUserSchema } from "../module/User/user.validation.js";
import { verifyEmailController } from "../module/User/email-verification.controller.js";
import { verifyEmailSchema } from "../module/User/user.validation.js";
import { validate } from "../middleware/validate.js";
import { authenticate } from "../middleware/authenticate.js";
import { getCurrentUserController } from "../module/User/currentUser.controller.js";

const authRouter = Router();

authRouter.post("/register", validate({body : registerUserSchema}), registerController);
authRouter.post("/verify-email", validate({body : verifyEmailSchema}), verifyEmailController);
authRouter.post("/login", validate({body : loginUserSchema}), loginController);
authRouter.post("/refresh", refreshTokenController);
authRouter.post("/logout", logoutController);
authRouter.get("/me", authenticate, getCurrentUserController);

export default authRouter;