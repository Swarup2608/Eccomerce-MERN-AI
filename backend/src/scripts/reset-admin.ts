import { loadConfig } from "../config/env.js";
import { createLogger } from "../lib/logger.js";
import { connectMongo, disconnectMongo } from "../lib/mongo.js";
import { createRedisClient } from "../lib/redis.js";
import { accountBlockKeys } from "../modules/auth/auth.service.js";
import { User } from "../modules/users/user.model.js";
import { USER_ROLES, adminPasswordSchema } from "../modules/users/user.validation.js";
import { revokeAllUserSessions } from "../utils/session-store.js";
import { hashPassword } from "../utils/password.js";
import { z } from "zod";

// Break-glass recovery for the admin account, run on a machine that already holds the production secrets. The normal
// path is "Forgot password" on the admin app; this is for when the admin mailbox itself is lost.
//   RESET_ADMIN_EMAIL=you@example.com RESET_ADMIN_PASSWORD='new-12+char-password' npm run reset:admin
// Every session of that admin is revoked.
async function main(): Promise<void> {
  const config = loadConfig();
  const logger = createLogger("info", { script: "reset-admin" });

  const parsed = z
    .object({
      email: z.string({ message: "RESET_ADMIN_EMAIL is not set" }).trim().email("RESET_ADMIN_EMAIL is not a valid email").transform((value) => value.toLowerCase()),
      password: z.string({ message: "RESET_ADMIN_PASSWORD is not set" }).pipe(adminPasswordSchema),
    })
    .safeParse({ email: process.env.RESET_ADMIN_EMAIL || undefined, password: process.env.RESET_ADMIN_PASSWORD || undefined });
  if (!parsed.success) {
    const problems = parsed.error.issues.map((issue) => `  - ${issue.message}`).join("\n");
    throw new Error(`${problems}\n\nUsage: RESET_ADMIN_EMAIL=you@example.com RESET_ADMIN_PASSWORD='New-12+chars' npm run reset:admin`);
  }
  const input = parsed.data;

  await connectMongo(config, logger);
  const redis = createRedisClient(config, logger);
  try {
    await redis.connect();
    const admin = await User.findOne({ email: input.email, role: USER_ROLES.ADMIN }).lean();
    if (!admin) throw new Error("No admin account has that email");

    await User.updateOne({ _id: admin._id }, { $set: { passwordHash: await hashPassword(input.password), passwordChangedAt: new Date(), blockedUntil: null, blockedReason: null } });
    await redis.del(...accountBlockKeys(admin));
    await revokeAllUserSessions(redis, admin._id.toString());
    logger.info("Admin password reset, any block lifted and all sessions revoked");
  } finally {
    redis.disconnect();
    await disconnectMongo();
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`Reset failed: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
