import { z } from "zod";
import { loadConfig } from "../config/env.js";
import { createLogger } from "../lib/logger.js";
import { connectMongo, disconnectMongo } from "../lib/mongo.js";
import { createRedisClient } from "../lib/redis.js";
import { accountBlockKeys } from "../modules/auth/auth.service.js";
import { User } from "../modules/users/user.model.js";
import { USER_STATUSES } from "../modules/users/user.validation.js";

// Support tool: lifts a 24-hour block (wrong passwords, wrong codes, too many verification emails) or a manual suspension
// without making the person reset their password.
//   UNBLOCK_EMAIL=person@example.com npm run unblock:user -w backend
// Owners can also unblock themselves by resetting their password from the emailed link.
async function main(): Promise<void> {
  const config = loadConfig();
  const logger = createLogger("info", { script: "unblock-user" });
  const email = z.string().trim().email().transform((value) => value.toLowerCase()).parse(process.env.UNBLOCK_EMAIL);

  await connectMongo(config, logger);
  const redis = createRedisClient(config, logger);
  try {
    await redis.connect();
    const user = await User.findOneAndUpdate({ email }, { $set: { status: USER_STATUSES.ACTIVE, blockedUntil: null, blockedReason: null } });
    if (!user) throw new Error("No account has that email");
    // Clears the failure counters and identifier blocks so the person can try again right away.
    await redis.del(...accountBlockKeys(user));
    logger.info("Account unblocked");
  } finally {
    redis.disconnect();
    await disconnectMongo();
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`Unblock failed: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
