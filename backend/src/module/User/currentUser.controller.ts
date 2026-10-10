import type { RequestHandler } from "express";

import { env } from "../../config/env.js";
import { SUPER_ADMIN_IDENTITY_ID } from "./super-admin.constants.js";
import { User } from "./user.model.js";

export const getCurrentUserController: RequestHandler = async (_req, res, next) => {
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

        if (authenticatedUser.userId === SUPER_ADMIN_IDENTITY_ID) {
            if (!env.SUPER_ADMIN_EMAIL || !env.SUPER_ADMIN_PASSWORD_HASH) {
                return res.status(401).json({
                    success: false,
                    error: {
                        code: "ACCOUNT_INACTIVE",
                        message: "Super Admin login is not configured.",
                    },
                });
            }

            return res.status(200).json({
                success: true,
                message: "Current user retrieved successfully.",
                data: {
                    user: {
                        _id: SUPER_ADMIN_IDENTITY_ID,
                        firstName: "Super",
                        lastName: "Admin",
                        email: env.SUPER_ADMIN_EMAIL,
                        userName: "super-admin",
                        role: "super_admin",
                        status: "active",
                        emailVerified: true,
                        phoneVerified: false,
                    },
                },
            });
        }

        const user = await User.findById(authenticatedUser.userId)
            .select("firstName lastName email userName phoneNumber role status emailVerified phoneVerified")
            .lean();

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
