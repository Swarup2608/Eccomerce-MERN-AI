import { z } from "zod";
import { USER_ROLES, USER_STATUSES } from "../User/user.validation.js";

export const userIdParamsSchema = z.object({
    userId: z.string().regex(/^[a-f\d]{24}$/i, "Invalid user ID."),
});

export const listUsersQuerySchema = z.object({
    search: z.string().trim().max(100).optional(),
    role: z.enum(USER_ROLES).optional(),
    status: z.enum(USER_STATUSES).optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type ListUsersQuery = z.infer<typeof listUsersQuerySchema>;

// "deleted" is reserved for account deletion, which is not an admin action.
export const updateUserStatusSchema = z.object({
    status: z.enum([USER_STATUSES.ACTIVE, USER_STATUSES.INACTIVE, USER_STATUSES.SUSPENDED]),
});

export type UpdateUserStatusInput = z.infer<typeof updateUserStatusSchema>;

// Vendor is granted by application approval and super_admin only by environment config.
export const ASSIGNABLE_ROLES = [USER_ROLES.USER, USER_ROLES.ADMIN, USER_ROLES.PROCUREMENT_OFFICER, USER_ROLES.VENDOR_ONBOARDING_REVIEWER] as const;

export const updateUserRoleSchema = z.object({
    role: z.enum(ASSIGNABLE_ROLES),
});

export type UpdateUserRoleInput = z.infer<typeof updateUserRoleSchema>;
