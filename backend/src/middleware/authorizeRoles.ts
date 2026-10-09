import type { RequestHandler } from "express";
import { AppError } from "../errors/AppError.js";

import type { UserRole } from "../module/User/user.validation.js";

export function authorizeRoles(...allowedRoles: UserRole[]): RequestHandler {
    return (_req,res,next) => {
        const user = res.locals.user as | {userId : string; sessionId: string; role?: UserRole} | undefined;

        if(!user) {
            return next(new AppError("User not authenticated.", 401, "AUTHENTICATION_REQUIRED"));
        }
        if(!user.role || !allowedRoles.includes(user.role)) {
            return next(new AppError("You do not have permission to perform this action.", 403, "FORBIDDEN"));
        }
        next();
    };
}
