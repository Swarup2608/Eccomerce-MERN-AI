import { loadConfig } from "../config/env.js";
import { createLogger } from "../lib/logger.js";
import { connectMongo, disconnectMongo } from "../lib/mongo.js";
import { R2Storage } from "../lib/storage.js";
import { UploadService } from "../modules/uploads/upload.service.js";

// Deletes images that were uploaded more than a day ago but never attached to a product (an abandoned product form).
// Run it daily from a scheduler:   npm run cleanup:uploads -w backend
const STALE_AFTER_MS = 24 * 60 * 60 * 1000;

async function main(): Promise<void> {
  const config = loadConfig();
  const logger = createLogger("info", { script: "cleanup-uploads" });
  if (!config.r2) throw new Error("R2 is not configured");

  await connectMongo(config, logger);
  try {
    const service = new UploadService(new R2Storage(config.r2), logger);
    let removed = 0;
    for (let batch = await service.cleanupPending(STALE_AFTER_MS); batch > 0; batch = await service.cleanupPending(STALE_AFTER_MS)) removed += batch;
    logger.info("Stale uploads removed", { removed });
  } finally {
    await disconnectMongo();
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`Upload cleanup failed: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
