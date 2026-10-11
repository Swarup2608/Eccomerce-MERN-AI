import type { RequestHandler } from "express";

import { objectIdSchema } from "../../utils/ids.js";
import { User } from "./user.model.js";

interface CurrentUserRecord {
    _id: { toString(): string };
    firstName: string;
    lastName: string;
    email: string;
    userName: string;
    phoneNumber?: string;
    role: string;
    status: string;
    emailVerified: boolean;
    phoneVerified: boolean;
}

export interface CurrentUserDependencies {
    findUser: (userId: string) => Promise<CurrentUserRecord | null>;
}

const defaultDependencies: CurrentUserDependencies = {
    findUser: async (userId) => (objectIdSchema.safeParse(userId).success ? User.findById(userId).select("firstName lastName email userName phoneNumber role status emailVerified phoneVerified").lean() : null),
};

export function createGetCurrentUserController(dependencies: CurrentUserDependencies = defaultDependencies): RequestHandler {
    return async (_req, res, next) => {
        try {
            const authenticatedUser = res.locals.user as { userId: string } | undefined;

            if (!authenticatedUser) {
                return res.status(401).json({
                    success: false,
                    error: {
                        code: "AUTHENTICATION_REQUIRED",
                        message: "Authentication is required.",
                    },
                });
            }

            const user = await dependencies.findUser(authenticatedUser.userId);

            if (!user) {
                return res.status(401).json({
                    success: false,
                    error: {
                        code: "USER_NOT_FOUND",
                        message: "The authenticated user could not be found.",
                    },
                });
            }

            return res.status(200).json({
                success: true,
                message: "Current user retrieved successfully.",
                data: {
                    user: {
                        _id: user._id.toString(),
                        firstName: user.firstName,
                        lastName: user.lastName,
                        email: user.email,
                        userName: user.userName,
                        phoneNumber: user.phoneNumber,
                        role: user.role,
                        status: user.status,
                        emailVerified: user.emailVerified,
                        phoneVerified: user.phoneVerified,
                    },
                },
            });
        } catch (error: unknown) {
            return next(error);
        }
    };
}

export const getCurrentUserController: RequestHandler = createGetCurrentUserController();
