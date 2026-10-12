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
//   RESET_ADMIN_EMAIL=you@example.com RESET_ADMIN_PASSWORD='new-12+char-password' npm run reset:admin -w backend
// Every session of that admin is revoked.
async function main(): Promise<void> {
  const config = loadConfig();
  const logger = createLogger("info", { script: "reset-admin" });

  const input = z
    .object({
      email: z.string().trim().email().transform((value) => value.toLowerCase()),
      password: adminPasswordSchema,
    })
    .parse({ email: process.env.RESET_ADMIN_EMAIL, password: process.env.RESET_ADMIN_PASSWORD || undefined });
  if (!input.password) throw new Error("Set RESET_ADMIN_PASSWORD");

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
