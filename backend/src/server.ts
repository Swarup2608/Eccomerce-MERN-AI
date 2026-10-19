import { createServer } from "node:http";
import { bootstrap } from "./bootstrap.js";
import { disconnectMongo } from "./lib/mongo.js";

const SHUTDOWN_TIMEOUT_MS = 10_000;
const ORDER_SWEEP_INTERVAL_MS = 60_000;
const ORDER_SWEEP_LOCK = "lock:order-expiry";

async function main(): Promise<void> {
  const { config, logger, redis, commerce, app } = await bootstrap();

  const server = createServer(app);
  // Bound how long a slow client can hold a socket open (slowloris protection).
  server.headersTimeout = 20_000;
  server.requestTimeout = 30_000;
  server.keepAliveTimeout = 5_000;
  server.maxHeadersCount = 100;

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(config.port, config.host, () => resolve());
  });
  logger.info("API listening", { host: config.host, port: config.port });

  // Unpaid online orders hand their stock back once the payment window closes. With several instances, a short Redis
  // lock lets only one of them sweep per interval.
  const sweep = setInterval(() => {
    void (async () => {
      try {
        if ((await redis.set(ORDER_SWEEP_LOCK, "1", "PX", ORDER_SWEEP_INTERVAL_MS - 5_000, "NX")) !== "OK") return;
        const expired = await commerce.orders.expireStale();
        if (expired > 0) logger.info("Expired unpaid orders", { count: expired });
      } catch (error) {
        logger.error("Order expiry sweep failed", { error });
      }
    })();
  }, ORDER_SWEEP_INTERVAL_MS);
  sweep.unref();

  let shuttingDown = false;
  const shutdown = async (reason: string, exitCode: number): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info("Shutting down", { reason });

    const forceExit = setTimeout(() => {
      logger.error("Graceful shutdown timed out, forcing exit");
      process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS);
    forceExit.unref();

    clearInterval(sweep);
    const closed = new Promise<void>((resolve) => server.close(() => resolve()));
    server.closeIdleConnections();
    await closed;
    await Promise.allSettled([disconnectMongo(), redis.quit()]);

    clearTimeout(forceExit);
    process.exit(exitCode);
  };

  process.once("SIGTERM", () => void shutdown("SIGTERM", 0));
  process.once("SIGINT", () => void shutdown("SIGINT", 0));
  process.on("unhandledRejection", (reason) => {
    logger.error("Unhandled promise rejection", { error: reason });
    void shutdown("unhandledRejection", 1);
  });
  process.on("uncaughtException", (error) => {
    logger.error("Uncaught exception", { error });
    void shutdown("uncaughtException", 1);
  });
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${JSON.stringify({ time: new Date().toISOString(), level: "error", msg: "Startup failed", error: message })}\n`);
  process.exit(1);
});
