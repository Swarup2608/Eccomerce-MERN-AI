import { z } from "zod";

export const USER_ROLES = {
    USER : "user",
    ADMIN : "admin",} as const;

export type UserRole = (typeof USER_ROLES)[keyof typeof USER_ROLES];

export const USER_STATUSES = {
    ACTIVE : "active",
    INACTIVE : "inactive",
    SUSPENDED : "suspended",
    DELETED : "deleted"
} as const;

export type UserStatus = (typeof USER_STATUSES)[keyof typeof USER_STATUSES];

// Why an account is temporarily blocked. A block lasts 24 hours, or until the password is reset from an emailed link.
export const BLOCK_REASONS = ["password", "mfa", "verification"] as const;

export type BlockReason = (typeof BLOCK_REASONS)[number];

export const isUserRole = (value: unknown): value is UserRole => typeof value === "string" && (Object.values(USER_ROLES) as string[]).includes(value);

const COMMON_PASSWORDS = new Set([
    "password1!", "password123!", "password@123", "password1@", "p@ssw0rd", "p@ssword1", "p@ssw0rd1", "passw0rd!", "welcome1!", "welcome@123", "welcome123!",
    "qwerty123!", "qwerty@123", "qwerty1234!", "admin@123", "admin123!", "admin@1234", "letmein123!", "abc12345!", "abcd@1234", "iloveyou1!", "changeme1!",
    "test@1234", "user@1234", "india@123", "monkey123!", "dragon123!", "football1!", "baseball1!", "sunshine1!", "princess1!", "superman1!",
]);

// One rule for every place a password is chosen or entered: 8-128 chars with upper, lower, digit and special character.
export const passwordSchema = z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(128, "Password must be at most 128 characters")
    .regex(/[a-z]/, "Password must contain a lowercase letter")
    .regex(/[A-Z]/, "Password must contain an uppercase letter")
    .regex(/\d/, "Password must contain a number")
    .regex(/[^A-Za-z0-9]/, "Password must contain a special character")
    .refine((value) => !COMMON_PASSWORDS.has(value.toLowerCase()), "That password is too common");

// Admins need a longer password (seed script, reset script and the emailed admin reset).
export const adminPasswordSchema = passwordSchema.pipe(z.string().min(12, "Admin password must be at least 12 characters"));

// Sign-in only checks the shape: the composition rules apply when a password is chosen, so a failed login never reveals the
// policy and accounts created under an older policy can still sign in.
const loginPasswordSchema = z.string().min(1, "Password is required").max(128, "Password must be at most 128 characters");

export const baseUserNameSchema = z.string().trim().min(3, "Username is required").max(30, "Username must be at most 30 characters").regex(/^[a-zA-Z0-9_-]+$/, "Username can only contain letters, numbers, hyphens and underscores").transform((val) => val.toLowerCase());

// Names that could impersonate staff; customers cannot claim them.
const RESERVED_USERNAMES = new Set(["admin", "administrator", "root", "support", "help", "system", "staff", "security", "official", "moderator", "mod", "owner", "billing", "api", "www", "postmaster", "webmaster", "null", "undefined"]);

export const registerUserSchema = z.object({
    firstName: z.string().trim().min(1, "First name is required").max(50, "First name must be at most 50 characters"),
    lastName: z.string().trim().min(1, "Last name is required").max(50, "Last name must be at most 50 characters"),
    email: z.string().trim().email("Invalid email address").max(254, "Email must be at most 254 characters").transform((val) => val.toLowerCase()),
    userName: baseUserNameSchema.refine((value) => !RESERVED_USERNAMES.has(value), "That username is not available"),
    password: passwordSchema,
    phoneNumber: z.string().trim().regex(/^\+[1-9]\d{7,14}$/, "Invalid phone number").optional()
}).strict();

export type RegisterUserInput = z.infer<typeof registerUserSchema>;

const oneTimeToken = z.string().trim().regex(/^[A-Za-z0-9_-]{43}$/, "Invalid or expired link");

export const verifyEmailSchema = z.object({ token: oneTimeToken }).strict();

export type VerifyEmailInput = z.infer<typeof verifyEmailSchema>;

export const forgotPasswordSchema = z.object({ email: z.string().trim().email("A valid email is required").max(254).transform((val) => val.toLowerCase()) }).strict();

export const resendVerificationSchema = forgotPasswordSchema;

export const resetPasswordSchema = z.object({ token: oneTimeToken, password: passwordSchema }).strict();

export const adminResetPasswordSchema = z.object({ token: oneTimeToken, password: adminPasswordSchema }).strict();

// Turning the emailed sign-in code on or off needs the current password, so a hijacked session alone can't switch it off.
export const setMfaSchema = z.object({ enabled: z.boolean(), currentPassword: z.string().min(1, "Current password is required").max(128) }).strict();

export const changePasswordSchema =z.object({ currentPassword: z.string().min(1, "Current password is required").max(128), newPassword: passwordSchema }).strict();

// Second step of admin sign-in: the challenge handed out after the password check plus the code that was emailed.
export const adminMfaVerifySchema = z.object({ challengeId: oneTimeToken, code: z.string().trim().regex(/^\d{6}$/, "Enter the 6-digit code") }).strict();

export const mfaResendSchema = z.object({ challengeId: oneTimeToken }).strict();

export const loginUserSchema = z.object({
    identifier: z.string().trim().min(1, "Email or username is required").max(254, "Identifier must be at most 254 characters").transform((val) => val.toLowerCase()),
    password: loginPasswordSchema,
}).strict();

export type LoginUserInput = z.infer<typeof loginUserSchema>;

export const superAdminLoginSchema = z.object({
    email: z.string().trim().email("A valid email is required.").transform((val) => val.toLowerCase()),
    password: loginPasswordSchema,
}).strict();

export type SuperAdminLoginInput = z.infer<typeof superAdminLoginSchema>;
