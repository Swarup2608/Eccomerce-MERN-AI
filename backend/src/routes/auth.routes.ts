import { Router } from "express";
import { registerController } from "../module/User/auth.controller.js";
import { registerUserSchema } from "../module/User/user.validation.js";
import { verifyEmailController } from "../module/User/email-verification.controller.js";
import { verifyEmailSchema } from "../module/User/user.validation.js";
import { validate } from "../middleware/validate.js";

const authRouter = Router();

authRouter.post("/register", validate({body : registerUserSchema}), registerController);
authRouter.post("/verify-email", validate({body : verifyEmailSchema}), verifyEmailController);

export default authRouter;