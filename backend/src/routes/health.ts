import { Router } from "express";

export type HealthCheck = () => Promise<void>;

const CHECK_TIMEOUT_MS = 3_000;

async function runCheck(check: HealthCheck): Promise<"up" | "down"> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error("Health check timed out")), CHECK_TIMEOUT_MS);
  });
  try {
    await Promise.race([check(), timeout]);
    return "up";
  } catch {
    return "down";
  } finally {
    clearTimeout(timer);
  }
}

export function healthRouter(checks: Record<string, HealthCheck>): Router {
  const router = Router();

  // Liveness: the process is serving requests. Never touches dependencies.
  router.get("/live", (_req, res) => {
    res.json({ status: "ok" });
  });

  // Readiness: every dependency answered. Reports only up/down, never error details.
  router.get("/ready", async (_req, res) => {
    const results = await Promise.all(Object.entries(checks).map(async ([name, check]) => [name, await runCheck(check)] as const));
    const ready = results.every(([, state]) => state === "up");
    res.status(ready ? 200 : 503).json({ status: ready ? "ok" : "unavailable", checks: Object.fromEntries(results) });
  });

  return router;
}
