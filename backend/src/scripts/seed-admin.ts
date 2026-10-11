import { z } from "zod";
import { loadConfig } from "../config/env.js";
import { createLogger } from "../lib/logger.js";
import { connectMongo, disconnectMongo } from "../lib/mongo.js";
import { User } from "../modules/users/user.model.js";
import { USER_ROLES, registerUserSchema } from "../modules/users/user.validation.js";
import { hashPassword } from "../utils/password.js";

// Same rules as user registration, but admins need a longer password.
const seedSchema = registerUserSchema.extend({ password: z.string().min(12, "Admin password must be at least 12 characters").max(128) });

async function main(): Promise<void> {
  const config = loadConfig();
  const logger = createLogger("info", { script: "seed-admin" });

  const parsed = seedSchema.safeParse({
    firstName: process.env.SEED_ADMIN_FIRST_NAME,
    lastName: process.env.SEED_ADMIN_LAST_NAME,
    email: process.env.SEED_ADMIN_EMAIL,
    userName: process.env.SEED_ADMIN_USERNAME,
    password: process.env.SEED_ADMIN_PASSWORD,
    phoneNumber: process.env.SEED_ADMIN_PHONE || undefined,
  });
  if (!parsed.success) {
    throw new Error(`Invalid SEED_ADMIN_* values:\n${parsed.error.issues.map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`).join("\n")}`);
  }
  const input = parsed.data;

  await connectMongo(config, logger);
  try {
    await User.createIndexes();

    const existing = await User.findOne({ $or: [{ email: input.email }, { userName: input.userName }] }).lean();
    if (existing) {
      // Never silently promote or overwrite an existing account.
      if (existing.role === USER_ROLES.ADMIN) logger.info("Admin already exists, nothing to do");
      else throw new Error("That email or username belongs to a non-admin account; choose different values");
      return;
    }

    const passwordHash = await hashPassword(input.password);
    await User.create({ firstName: input.firstName, lastName: input.lastName, email: input.email, userName: input.userName, phoneNumber: input.phoneNumber, passwordHash, role: USER_ROLES.ADMIN, emailVerified: true });
    logger.info("Admin created. Remove the SEED_ADMIN_* values from your env file now.");
  } finally {
    await disconnectMongo();
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`Seeding failed: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
