import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { config } from "./config.js";
import { closeDb } from "./db.js";
import { userIdFrom } from "./auth.js";
import { BadRequest, recommend } from "./recommend.js";
import { suggest } from "./outfits.js";
import { converse } from "./chat.js";
import { setFeedback } from "./feedback.js";
import { startAutoIndex } from "./embeddings.js";
import { log, snapshot } from "./metrics.js";
import { addItem, listItems, MAX_IMAGE_CHARS, removeItem, validateItem } from "./wardrobe.js";

const BASE = "/api/v1/stylist";

class HttpError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}

const send = (res: ServerResponse, status: number, body?: unknown) => {
  if (body === undefined) { res.writeHead(status); return res.end(); }
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
};

async function readBody(req: IncomingMessage, limit: number): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req as AsyncIterable<Buffer>) {
    size += chunk.length;
    if (size > limit) throw new HttpError(413, "That upload is too large");
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"); } catch { throw new BadRequest("body must be JSON"); }
}

// Per-shopper cap so one account can't hammer the weather service or the database.
const hits = new Map<string, number[]>();
function throttle(userId: string, perMinute = 40, bucket = "api"): void {
  const now = Date.now();
  const key = `${bucket}:${userId}`;
  const recent = (hits.get(key) ?? []).filter((t) => now - t < 60_000);
  if (recent.length >= perMinute) throw new HttpError(429, "Too many requests. Please wait a moment.");
  hits.set(key, [...recent, now]);
}

function cors(req: IncomingMessage, res: ServerResponse): boolean {
  const origin = req.headers.origin;
  if (origin === config.storefrontUrl) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.setHeader("Vary", "Origin");
  }
  if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return true; }
  // CORS hides responses but doesn't stop a cross-site form from sending a request, so refuse foreign origins on writes.
  if (req.method !== "GET" && origin !== config.storefrontUrl) throw new HttpError(403, "Origin not allowed");
  return false;
}

const server = createServer(async (req, res) => {
  try {
    if (cors(req, res)) return;
    const path = (req.url ?? "").split("?")[0] ?? "";
    if (req.method === "GET" && path === "/health") return send(res, 200, { ok: true });
    if (req.method === "GET" && path === "/metrics") return send(res, 200, snapshot());
    if (req.method === "POST" && path === "/recommend") return send(res, 200, await recommend(await readBody(req, 10_000)));

    if (path === `${BASE}/wardrobe` || path.startsWith(`${BASE}/wardrobe/`) || path === `${BASE}/suggest` || path === `${BASE}/chat` || path === `${BASE}/feedback`) {
      const userId = userIdFrom(req);
      if (!userId) throw new HttpError(401, "Sign in to continue");
      throttle(userId, path === `${BASE}/chat` ? 12 : 40, path === `${BASE}/chat` ? "chat" : "api");
      if (req.method === "GET" && path === `${BASE}/wardrobe`) return send(res, 200, { items: await listItems(userId) });
      if (req.method === "POST" && path === `${BASE}/wardrobe`) return send(res, 201, { item: await addItem(userId, validateItem(await readBody(req, MAX_IMAGE_CHARS + 5_000))) });
      if (req.method === "DELETE" && path.startsWith(`${BASE}/wardrobe/`)) {
        return (await removeItem(userId, path.slice(`${BASE}/wardrobe/`.length))) ? send(res, 204) : send(res, 404, { error: "Item not found" });
      }
      if (req.method === "POST" && path === `${BASE}/suggest`) return send(res, 200, await suggest(await readBody(req, 10_000), await listItems(userId), userId));
      if (req.method === "POST" && path === `${BASE}/chat`) {
        const body = await readBody(req, 20_000);
        if (!String(req.headers.accept).includes("application/x-ndjson")) return send(res, 200, await converse(body, userId));
        // Streaming: one JSON object per line. Headers go out with the first line, so a bad request still gets a plain 400.
        const line = (o: unknown) => {
          if (!res.headersSent) res.writeHead(200, { "content-type": "application/x-ndjson", "cache-control": "no-store" });
          res.write(`${JSON.stringify(o)}\n`);
        };
        const result = await converse(body, userId, (text) => line({ type: "progress", text }));
        line({ type: "result", result });
        return void res.end();
      }
      if (req.method === "POST" && path === `${BASE}/feedback`) { await setFeedback(userId, await readBody(req, 2_000)); return send(res, 204); }
    }
    send(res, 404, { error: "not found" });
  } catch (err) {
    // A stream that already started can't change its status; finish it with an error line instead.
    if (res.headersSent) {
      log("error", { message: err instanceof Error ? err.message : String(err) });
      return void res.end(`${JSON.stringify({ type: "error", error: "could not build suggestions right now" })}\n`);
    }
    if (err instanceof HttpError) return send(res, err.status, { error: err.message });
    if (err instanceof BadRequest) return send(res, 400, { error: err.message });
    log("error", { message: err instanceof Error ? err.message : String(err) });
    send(res, 502, { error: "could not build suggestions right now" });
  }
});

server.listen(config.port, () => console.log(`stylist-node on :${config.port}`));
const stopIndex = startAutoIndex(config.reindexMinutes);
for (const sig of ["SIGINT", "SIGTERM"] as const) process.on(sig, () => { stopIndex(); server.close(() => void closeDb().then(() => process.exit(0))); });
