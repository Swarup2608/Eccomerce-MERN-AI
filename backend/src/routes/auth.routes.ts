import { Router } from "express";
import { registerController, loginController, refreshTokenController } from "../module/User/auth.controller.js";
import { registerUserSchema, loginUserSchema } from "../module/User/user.validation.js";
import { verifyEmailController } from "../module/User/email-verification.controller.js";
import { verifyEmailSchema } from "../module/User/user.validation.js";
import { validate } from "../middleware/validate.js";

const authRouter = Router();

authRouter.post("/register", validate({body : registerUserSchema}), registerController);
authRouter.post("/verify-email", validate({body : verifyEmailSchema}), verifyEmailController);
authRouter.post("/login", validate({body : loginUserSchema}), loginController);
authRouter.post("/refresh", refreshTokenController);

export default authRouter;