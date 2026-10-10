import type { Response } from "express";
import { AppError } from "../errors/AppError.js";
import { SUPER_ADMIN_IDENTITY_ID } from "../module/User/super-admin.constants.js";
import type { UserRole } from "../module/User/user.validation.js";

export interface AuthenticatedActor {
    userId: string;
    sessionId: string;
    role: UserRole;
}

// Identity always comes from the verified access token, never from the request.
export function getActor(res: Response): AuthenticatedActor {
    const user = res.locals.user as Partial<AuthenticatedActor> | undefined;

    if (!user?.userId || !user.sessionId || !user.role) {
        throw new AppError("Authentication is required.", 401, "AUTHENTICATION_REQUIRED");
    }

    return { userId: user.userId, sessionId: user.sessionId, role: user.role };
}

export function isSuperAdminId(userId: string): boolean {
    return userId === SUPER_ADMIN_IDENTITY_ID;
}
