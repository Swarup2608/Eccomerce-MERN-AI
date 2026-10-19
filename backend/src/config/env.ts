import { config as loadDotenv } from "dotenv";
import { isIP } from "node:net";
import { z } from "zod";

const LOG_LEVELS = ["debug", "info", "warn", "error"] as const;

export type LogLevel = (typeof LOG_LEVELS)[number];

const isExactOrigin = (value: string): boolean => URL.canParse(value) && ["http:", "https:"].includes(new URL(value).protocol) && new URL(value).origin === value;

const originSchema = z.string().trim().refine(isExactOrigin, "must be an exact origin like https://shop.example.com (no path or trailing slash)");

const INTEGRATION_GROUPS = [
  ["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET", "R2_PUBLIC_URL"],
  ["RAZORPAY_KEY_ID", "RAZORPAY_KEY_SECRET", "RAZORPAY_WEBHOOK_SECRET"],
  ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"],
] as const;

const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    HOST: z.string().trim().min(1).optional(),
    PORT: z.coerce.number().int().min(1).max(65535).default(4000),
    MONGODB_URI: z.string().trim().regex(/^mongodb(\+srv)?:\/\//, "must start with mongodb:// or mongodb+srv://"),
    MONGODB_DB_NAME: z.string().trim().min(1).optional(),
    REDIS_URL: z.string().trim().regex(/^rediss?:\/\//, "must start with redis:// or rediss://"),
    TRUST_PROXY: z.coerce.number().int().min(0).max(10).optional(),
    LOG_LEVEL: z.enum(LOG_LEVELS).default("info"),
    RATE_LIMIT_WINDOW_MS: z.coerce.number().int().min(1000).default(60_000),
    RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(120),
    ACCESS_TOKEN_SECRET: z.string().min(32, "must be at least 32 characters (use a random 48-byte value)"),
    ADMIN_ACCESS_TOKEN_SECRET: z.string().min(32, "must be at least 32 characters (use a random 48-byte value)"),
    ADMIN_ALLOWED_IPS: z.string().optional().transform((value) => (value ?? "").split(",").map((ip) => ip.trim()).filter(Boolean)).pipe(z.array(z.string().refine((ip) => isIP(ip) !== 0, "must be exact IP addresses"))),
    STOREFRONT_URL: originSchema,
    ADMIN_URL: originSchema,
    API_PUBLIC_URL: originSchema.optional(),
    SMTP_HOST: z.string().trim().min(1).optional(),
    SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(587),
    SMTP_SECURE: z.enum(["true", "false"]).default("false").transform((value) => value === "true"),
    SMTP_USER: z.string().optional(),
    // Alias for SMTP_USER (the mailbox that signs in to SMTP); SMTP_USER wins when both are set.
    SMTP_EMAIL: z.string().trim().optional(),
    SMTP_PASS: z.string().optional(),
    EMAIL_FROM: z.string().trim().min(3).optional(),
    R2_ACCOUNT_ID: z.string().trim().regex(/^[a-f0-9]{32}$/, "must be the 32-character Cloudflare account id").optional(),
    R2_ACCESS_KEY_ID: z.string().trim().min(1).optional(),
    R2_SECRET_ACCESS_KEY: z.string().trim().min(1).optional(),
    R2_BUCKET: z.string().trim().regex(/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/, "must be a valid bucket name").optional(),
    R2_PUBLIC_URL: originSchema.optional(),
    RAZORPAY_KEY_ID: z.string().trim().regex(/^rzp_(test|live)_[A-Za-z0-9]+$/, "must look like rzp_test_... or rzp_live_...").optional(),
    RAZORPAY_KEY_SECRET: z.string().trim().min(1).optional(),
    RAZORPAY_WEBHOOK_SECRET: z.string().trim().min(1).optional(),
    STRIPE_SECRET_KEY: z.string().trim().regex(/^sk_(test|live)_[A-Za-z0-9]+$/, "must look like sk_test_... or sk_live_...").optional(),
    STRIPE_WEBHOOK_SECRET: z.string().trim().regex(/^whsec_[A-Za-z0-9]+$/, "must look like whsec_...").optional(),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV === "production" && !env.STOREFRONT_URL.startsWith("https://")) {
      ctx.addIssue({ code: "custom", path: ["STOREFRONT_URL"], message: "production origins must use https" });
    }
    if (env.NODE_ENV === "production" && !env.ADMIN_URL.startsWith("https://")) {
      ctx.addIssue({ code: "custom", path: ["ADMIN_URL"], message: "production origins must use https" });
    }
    if (env.NODE_ENV === "production") {
      if (env.TRUST_PROXY === undefined) ctx.addIssue({ code: "custom", path: ["TRUST_PROXY"], message: "must be set explicitly in production (number of proxy hops in front of the API)" });
      if (!env.SMTP_HOST || !env.EMAIL_FROM) ctx.addIssue({ code: "custom", path: ["SMTP_HOST"], message: "SMTP_HOST and EMAIL_FROM are required in production (verification, reset and admin sign-in emails)" });
    }
    if (Boolean(env.SMTP_USER || env.SMTP_EMAIL) !== Boolean(env.SMTP_PASS)) {
      ctx.addIssue({ code: "custom", path: ["SMTP_USER"], message: "SMTP_USER (or SMTP_EMAIL) and SMTP_PASS must be set together" });
    }
    // Each integration is all-or-nothing: a half-configured one would fail at the worst moment (mid-upload or mid-checkout).
    for (const group of INTEGRATION_GROUPS) {
      const set = group.filter((name) => Boolean(env[name]));
      if (set.length > 0 && set.length < group.length) ctx.addIssue({ code: "custom", path: [group.find((name) => !env[name]) ?? group[0]], message: `${group.join(", ")} must be set together` });
    }
    if (env.ACCESS_TOKEN_SECRET === env.ADMIN_ACCESS_TOKEN_SECRET) {
      ctx.addIssue({ code: "custom", path: ["ADMIN_ACCESS_TOKEN_SECRET"], message: "must differ from ACCESS_TOKEN_SECRET" });
    }
  });

export interface AppConfig {
  env: "development" | "test" | "production";
  isProduction: boolean;
  host: string;
  port: number;
  mongodbUri: string;
  mongodbDbName: string | undefined;
  redisUrl: string;
  storefrontUrl: string;
  adminUrl: string;
  trustProxy: number;
  logLevel: LogLevel;
  rateLimit: { windowMs: number; max: number };
  auth: { accessTokenSecret: string; adminAccessTokenSecret: string; secureCookies: boolean };
  adminAllowedIps: readonly string[];
  apiPublicUrl: string | undefined;
  mail: { host: string | undefined; port: number; secure: boolean; user: string | undefined; pass: string | undefined; from: string };
  // Each integration is undefined when it is not configured; the feature then answers 503 instead of failing at startup.
  r2: R2Config | undefined;
  razorpay: RazorpayConfig | undefined;
  stripe: StripeConfig | undefined;
}

export interface R2Config {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  publicUrl: string;
}

export interface RazorpayConfig {
  keyId: string;
  keySecret: string;
  webhookSecret: string;
}

export interface StripeConfig {
  secretKey: string;
  webhookSecret: string;
}

const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "[::1]"]);

// Approximation of "same site": the last two host labels. It cannot know public suffixes like co.uk, so it only warns.
const siteOf = (origin: string): string => new URL(origin).hostname.split(".").slice(-2).join(".");

// Cookies are SameSite=Strict, so the API and every frontend must share a registrable domain or login silently fails.
export function deploymentWarnings(config: Pick<AppConfig, "storefrontUrl" | "adminUrl" | "apiPublicUrl" | "isProduction" | "trustProxy">): string[] {
  const warnings: string[] = [];
  if (!config.apiPublicUrl) {
    if (config.isProduction) warnings.push("API_PUBLIC_URL is not set, so the same-site cookie check was skipped");
  } else {
    const apiSite = siteOf(config.apiPublicUrl);
    for (const origin of [config.storefrontUrl, config.adminUrl]) {
      if (!LOCAL_HOSTNAMES.has(new URL(origin).hostname) && siteOf(origin) !== apiSite) {
        warnings.push(`${origin} is not on the same site as ${config.apiPublicUrl}; SameSite=Strict cookies will be blocked and sign-in will fail`);
      }
    }
  }
  if (config.isProduction && config.trustProxy === 0) warnings.push("TRUST_PROXY=0: if a proxy or load balancer sits in front of the API, every user shares one rate-limit bucket");
  return warnings;
}

export function loadConfig(): AppConfig {
  // Platforms inject real env vars; .env is a local convenience and never overrides them.
  loadDotenv({ quiet: true });

  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    // Name the bad variables without echoing their (possibly secret) values.
    const problems = parsed.error.issues.map((issue) => `  - ${issue.path.join(".") || "env"}: ${issue.message}`);
    throw new Error(`Invalid environment configuration:\n${problems.join("\n")}`);
  }

  const env = parsed.data;
  const isProduction = env.NODE_ENV === "production";
  const smtpUser = env.SMTP_USER || env.SMTP_EMAIL || undefined;

  return Object.freeze({
    env: env.NODE_ENV,
    isProduction,
    host: env.HOST ?? (isProduction ? "0.0.0.0" : "127.0.0.1"),
    port: env.PORT,
    mongodbUri: env.MONGODB_URI,
    mongodbDbName: env.MONGODB_DB_NAME,
    redisUrl: env.REDIS_URL,
    storefrontUrl: env.STOREFRONT_URL,
    adminUrl: env.ADMIN_URL,
    trustProxy: env.TRUST_PROXY ?? 0,
    logLevel: env.LOG_LEVEL,
    rateLimit: Object.freeze({ windowMs: env.RATE_LIMIT_WINDOW_MS, max: env.RATE_LIMIT_MAX }),
    auth: Object.freeze({ accessTokenSecret: env.ACCESS_TOKEN_SECRET, adminAccessTokenSecret: env.ADMIN_ACCESS_TOKEN_SECRET, secureCookies: isProduction }),
    adminAllowedIps: Object.freeze(env.ADMIN_ALLOWED_IPS),
    apiPublicUrl: env.API_PUBLIC_URL,
    mail: Object.freeze({ host: env.SMTP_HOST, port: env.SMTP_PORT, secure: env.SMTP_SECURE, user: smtpUser, pass: env.SMTP_PASS || undefined, from: env.EMAIL_FROM ?? "Storefront <no-reply@localhost>" }),
    r2: env.R2_ACCOUNT_ID && env.R2_ACCESS_KEY_ID && env.R2_SECRET_ACCESS_KEY && env.R2_BUCKET && env.R2_PUBLIC_URL
      ? Object.freeze({ accountId: env.R2_ACCOUNT_ID, accessKeyId: env.R2_ACCESS_KEY_ID, secretAccessKey: env.R2_SECRET_ACCESS_KEY, bucket: env.R2_BUCKET, publicUrl: env.R2_PUBLIC_URL })
      : undefined,
    razorpay: env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET && env.RAZORPAY_WEBHOOK_SECRET
      ? Object.freeze({ keyId: env.RAZORPAY_KEY_ID, keySecret: env.RAZORPAY_KEY_SECRET, webhookSecret: env.RAZORPAY_WEBHOOK_SECRET })
      : undefined,
    stripe: env.STRIPE_SECRET_KEY && env.STRIPE_WEBHOOK_SECRET ? Object.freeze({ secretKey: env.STRIPE_SECRET_KEY, webhookSecret: env.STRIPE_WEBHOOK_SECRET }) : undefined,
  });
}
