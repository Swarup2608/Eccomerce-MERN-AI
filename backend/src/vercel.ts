import type { IncomingMessage, ServerResponse } from "node:http";
import { bootstrap } from "./bootstrap.js";
import type { Bootstrapped } from "./bootstrap.js";

// Serverless entry: no listen(), no timers, no process.exit. The app is built once per warm instance and reused, and a
// failed start is retried on the next request instead of crashing the function.
let ready: Promise<Bootstrapped> | undefined;

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  ready ??= bootstrap().catch((error: unknown) => {
    ready = undefined;
    throw error;
  });

  let app: Bootstrapped["app"];
  try {
    ({ app } = await ready);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${JSON.stringify({ time: new Date().toISOString(), level: "error", msg: "Startup failed", error: message })}\n`);
    res.statusCode = 503;
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Cache-Control", "no-store");
    res.end(JSON.stringify({ error: { code: "SERVICE_UNAVAILABLE", message: "Service is starting or misconfigured" } }));
    return;
  }

  app(req, res);
}
