import "dotenv/config";
import {z} from "zod";

const envSchema = z.object({
    NODE_ENV: z.enum(["development","test","production"]).default("development"),

    PORT : z.coerce.number().int().positive().default(5000),

    MONGO_URI : z.string().min(1,"MONGO_URI is required"),

    REDIS_URL: z.string().min(1, "REDIS_URL is required"),

    JWT_ACCESS_SECRET : z.string().min(32,"JWT_ACCESS_SECRET must be at least 32 characters"),
    JWT_REFRESH_SECRET : z.string().min(32,"JWT_REFRESH_SECRET must be at least 32 characters"),

    CORS_ORIGIN : z.string().url("CORS_ORIGIN must be a valid URL"),

    COOKIE_SECURE : z.enum(["true","false"]).transform((value)=> value === "true").default(false)
});

const parsedEnv = envSchema.safeParse(process.env);

if(!parsedEnv.success){
    console.error("Invalid environment configuration");
    console.error(z.prettifyError(parsedEnv.error));
    process.exit(1);
}

export const env = parsedEnv.data;
export {envSchema};