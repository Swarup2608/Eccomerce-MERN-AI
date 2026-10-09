import { z } from "zod";

export const USER_ROLES = {
    USER : "user",
    VENDOR : "vendor",
    ADMIN : "admin",
    SUPER_ADMIN : "super_admin"
} as const;

export type UserRole = (typeof USER_ROLES)[keyof typeof USER_ROLES];

export const USER_STATUSES = {
    ACTIVE : "active",
    INACTIVE : "inactive",
    SUSPENDED : "suspended",
    DELETED : "deleted"
} as const;

export type UserStatus = (typeof USER_STATUSES)[keyof typeof USER_STATUSES];

export const registerUserSchema = z.object({
    firstName: z.string().trim().min(1, "First name is required").max(50, "First name must be at most 50 characters"),
    lastName: z.string().trim().min(1, "Last name is required").max(50, "Last name must be at most 50 characters"),
    email: z.string().trim().email("Invalid email address").max(254, "Email must be at most 254 characters").transform((val) => val.toLowerCase()),
    userName: z.string().trim().min(3, "Username is required").max(30, "Username must be at most 30 characters").regex(/^[a-zA-Z0-9_-]+$/, "Username can only contain letters, numbers, and underscores").transform((val) => val.toLowerCase()),
    password: z.string().min(8, "Password must be at least 8 characters").max(128, "Password must be at most 128 characters"),
    phoneNumber: z.string().trim().regex(/^\+[1-9]\d{7,14}$/, "Invalid phone number").optional()
}).strict();

export type RegisterUserInput = z.infer<typeof registerUserSchema>;

export const verifyEmailSchema = z.object({ token: z.string().trim().min(1, "Verification token is required"), }).strict();

export type VerifyEmailInput = z.infer<typeof verifyEmailSchema>;

export const loginUserSchema = z.object({
    identifier: z.string().trim().min(1, "Email or username is required").max(254, "Identifier must be at most 254 characters").transform((val) => val.toLowerCase()),
    password: z.string().min(8, "Password must be at least 8 characters").max(128, "Password must be at most 128 characters"),
}).strict();

export type LoginUserInput = z.infer<typeof loginUserSchema>;