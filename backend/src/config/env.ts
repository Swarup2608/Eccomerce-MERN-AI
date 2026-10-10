import "dotenv/config";
import { z } from "zod";

const optionalSecret = z.string().trim().min(1).optional();

const envSchema = z.object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

    PORT: z.coerce.number().int().positive().default(5000),

    MONGO_URI: z.string().min(1, "MONGO_URI is required"),

    REDIS_URL: z.string().min(1, "REDIS_URL is required"),

    JWT_ACCESS_SECRET: z.string().min(32, "JWT_ACCESS_SECRET must be at least 32 characters"),
    JWT_REFRESH_SECRET: z.string().min(32, "JWT_REFRESH_SECRET must be at least 32 characters"),

    // Comma-separated list so the storefront, admin and vendor apps can all call the API.
    CORS_ORIGIN: z.string().min(1, "CORS_ORIGIN is required").transform((value, ctx) => {
        const origins = value.split(",").map((origin) => origin.trim()).filter(Boolean);
        for (const origin of origins) {
            if (!z.url().safeParse(origin).success) {
                ctx.addIssue({ code: "custom", message: `CORS_ORIGIN contains an invalid URL: ${origin}` });
            }
        }
        return origins;
    }),

    COOKIE_SECURE: z.enum(["true", "false"]).transform((value) => value === "true").default(false),

    SMTP_HOST: z.string().min(1).optional(),
    SMTP_PORT: z.coerce.number().int().positive().default(587),
    SMTP_SECURE: z.enum(["true", "false"]).transform((value) => value === "true").default(false),
    SMTP_USER: z.string().min(1).optional(),
    SMTP_PASS: z.string().min(1).optional(),
    EMAIL_FROM: z.string().email().optional(),

    STOREFRONT_URL: z.string().url("STOREFRONT_URL must be a valid URL").default("http://localhost:3000"),
    ADMIN_URL: z.string().url("ADMIN_URL must be a valid URL").default("http://localhost:3001"),
    VENDOR_URL: z.string().url("VENDOR_URL must be a valid URL").default("http://localhost:3002"),

    SUPER_ADMIN_EMAIL: z.string().trim().email("SUPER_ADMIN_EMAIL must be a valid email").transform((value) => value.toLowerCase()).optional(),
    SUPER_ADMIN_PASSWORD_HASH: z.string().startsWith("$argon2id$", "SUPER_ADMIN_PASSWORD_HASH must be an Argon2id hash").optional(),

    // 32-byte key (64 hex chars) for encrypting bank account numbers at rest.
    DATA_ENCRYPTION_KEY: z.string().regex(/^[0-9a-fA-F]{64}$/, "DATA_ENCRYPTION_KEY must be 64 hex characters").optional(),

    CLOUDINARY_CLOUD_NAME: optionalSecret,
    CLOUDINARY_API_KEY: optionalSecret,
    CLOUDINARY_API_SECRET: optionalSecret,

    RAZORPAY_KEY_ID: optionalSecret,
    RAZORPAY_KEY_SECRET: optionalSecret,
    RAZORPAY_WEBHOOK_SECRET: optionalSecret,

    STRIPE_SECRET_KEY: optionalSecret,
    STRIPE_PUBLISHABLE_KEY: optionalSecret,
    STRIPE_WEBHOOK_SECRET: optionalSecret,

    CURRENCY: z.string().trim().length(3).toUpperCase().default("INR"),
    PLATFORM_COMMISSION_PERCENT: z.coerce.number().min(0).max(100).default(10),
    FREE_SHIPPING_THRESHOLD: z.coerce.number().min(0).default(999),
    SHIPPING_FEE: z.coerce.number().min(0).default(49),
    RETURN_WINDOW_DAYS: z.coerce.number().int().min(0).max(90).default(7),
    PAYMENT_RESERVATION_MINUTES: z.coerce.number().int().min(5).max(24 * 60).default(30),
}).superRefine((value, ctx) => {
    if (value.NODE_ENV === "production" && !value.DATA_ENCRYPTION_KEY) {
        ctx.addIssue({ code: "custom", path: ["DATA_ENCRYPTION_KEY"], message: "DATA_ENCRYPTION_KEY is required in production" });
    }
});

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
    console.error("Invalid environment configuration");
    console.error(z.prettifyError(parsedEnv.error));
    process.exit(1);
}

export const env = parsedEnv.data;
export { envSchema };
