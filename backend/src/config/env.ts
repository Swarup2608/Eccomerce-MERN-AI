import { config as loadDotenv } from "dotenv";
import { z } from "zod";

const LOG_LEVELS = ["debug", "info", "warn", "error"] as const;

export type LogLevel = (typeof LOG_LEVELS)[number];

const isExactOrigin = (value: string): boolean => URL.canParse(value) && ["http:", "https:"].includes(new URL(value).protocol) && new URL(value).origin === value;

const originSchema = z.string().trim().refine(isExactOrigin, "must be an exact origin like https://shop.example.com (no path or trailing slash)");

const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    HOST: z.string().trim().min(1).optional(),
    PORT: z.coerce.number().int().min(1).max(65535).default(4000),
    MONGODB_URI: z.string().trim().regex(/^mongodb(\+srv)?:\/\//, "must start with mongodb:// or mongodb+srv://"),
    MONGODB_DB_NAME: z.string().trim().min(1).optional(),
    REDIS_URL: z.string().trim().regex(/^rediss?:\/\//, "must start with redis:// or rediss://"),
    CORS_ORIGINS: z.string().transform((value) => value.split(",").map((origin) => origin.trim()).filter(Boolean)).pipe(z.array(originSchema).min(1)),
    TRUST_PROXY: z.coerce.number().int().min(0).max(10).default(0),
    LOG_LEVEL: z.enum(LOG_LEVELS).default("info"),
    RATE_LIMIT_WINDOW_MS: z.coerce.number().int().min(1000).default(60_000),
    RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(120),
    ACCESS_TOKEN_SECRET: z.string().min(32, "must be at least 32 characters (use a random 48-byte value)"),
    ADMIN_ACCESS_TOKEN_SECRET: z.string().min(32, "must be at least 32 characters (use a random 48-byte value)"),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV === "production" && env.CORS_ORIGINS.some((origin) => !origin.startsWith("https://"))) {
      ctx.addIssue({ code: "custom", path: ["CORS_ORIGINS"], message: "production origins must use https" });
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
  corsOrigins: readonly string[];
  trustProxy: number;
  logLevel: LogLevel;
  rateLimit: { windowMs: number; max: number };
  auth: { accessTokenSecret: string; adminAccessTokenSecret: string; secureCookies: boolean };
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

  return Object.freeze({
    env: env.NODE_ENV,
    isProduction,
    host: env.HOST ?? (isProduction ? "0.0.0.0" : "127.0.0.1"),
    port: env.PORT,
    mongodbUri: env.MONGODB_URI,
    mongodbDbName: env.MONGODB_DB_NAME,
    redisUrl: env.REDIS_URL,
    corsOrigins: Object.freeze([...env.CORS_ORIGINS]),
    trustProxy: env.TRUST_PROXY,
    logLevel: env.LOG_LEVEL,
    rateLimit: Object.freeze({ windowMs: env.RATE_LIMIT_WINDOW_MS, max: env.RATE_LIMIT_MAX }),
    auth: Object.freeze({ accessTokenSecret: env.ACCESS_TOKEN_SECRET, adminAccessTokenSecret: env.ADMIN_ACCESS_TOKEN_SECRET, secureCookies: isProduction }),
  });
}
