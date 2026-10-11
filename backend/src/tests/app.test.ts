import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { after, before, describe, it } from "node:test";
import { createApp } from "../app.js";
import { createLogger } from "../lib/logger.js";
import { MemoryRateLimitStore, clientKey } from "../middleware/rate-limit.js";

const ALLOWED_ORIGIN = "http://localhost:3000";
const RATE_LIMIT_MAX = 25;

let server: Server;
let baseUrl: string;
let redisUp = true;

before(async () => {
  const app = createApp({
    config: { corsOrigins: [ALLOWED_ORIGIN], trustProxy: 0, rateLimit: { windowMs: 60_000, max: RATE_LIMIT_MAX } },
    logger: createLogger("error"),
    rateLimitStore: new MemoryRateLimitStore(),
    healthChecks: {
      mongo: () => Promise.resolve(),
      redis: () => (redisUp ? Promise.resolve() : Promise.reject(new Error("down"))),
    },
  });
  server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", () => resolve()));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

function postJson(path: string, body: string, headers: Record<string, string> = {}): Promise<Response> {
  return fetch(`${baseUrl}${path}`, { method: "POST", headers: { "content-type": "application/json", ...headers }, body });
}

describe("security headers", () => {
  it("sets strict headers and hides the framework", async () => {
    const res = await fetch(`${baseUrl}/health/live`);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("x-powered-by"), null);
    assert.equal(res.headers.get("x-content-type-options"), "nosniff");
    assert.equal(res.headers.get("cache-control"), "no-store");
    assert.match(res.headers.get("content-security-policy") ?? "", /default-src 'none'/);
    assert.match(res.headers.get("strict-transport-security") ?? "", /max-age=63072000/);
    assert.ok(res.headers.get("x-request-id"));
  });

  it("ignores malformed upstream request ids", async () => {
    const res = await fetch(`${baseUrl}/health/live`, { headers: { "x-request-id": "<script>" } });
    assert.notEqual(res.headers.get("x-request-id"), "<script>");
  });
});

describe("cors and origin guard", () => {
  it("allows configured origins", async () => {
    const res = await fetch(`${baseUrl}/api/v1`, { headers: { origin: ALLOWED_ORIGIN } });
    assert.equal(res.headers.get("access-control-allow-origin"), ALLOWED_ORIGIN);
    assert.equal(res.headers.get("access-control-allow-credentials"), "true");
  });

  it("omits CORS headers for unknown origins", async () => {
    const res = await fetch(`${baseUrl}/api/v1`, { headers: { origin: "https://evil.example" } });
    assert.equal(res.headers.get("access-control-allow-origin"), null);
  });

  it("rejects state-changing requests from unknown origins", async () => {
    const res = await postJson("/api/v1", "{}", { origin: "https://evil.example" });
    assert.equal(res.status, 403);
    const body = (await res.json()) as { error: { code: string } };
    assert.equal(body.error.code, "ORIGIN_NOT_ALLOWED");
  });
});

describe("request body handling", () => {
  it("rejects invalid JSON", async () => {
    const res = await postJson("/api/v1", "{not json");
    assert.equal(res.status, 400);
  });

  it("rejects oversized bodies", async () => {
    const res = await postJson("/api/v1", JSON.stringify({ data: "x".repeat(200 * 1024) }));
    assert.equal(res.status, 413);
  });

  it("rejects MongoDB operator keys", async () => {
    const res = await postJson("/api/v1", JSON.stringify({ email: { $gt: "" } }));
    assert.equal(res.status, 400);
    const body = (await res.json()) as { error: { code: string } };
    assert.equal(body.error.code, "UNSAFE_INPUT");
  });

  it("rejects prototype pollution keys", async () => {
    const res = await postJson("/api/v1", '{"__proto__":{"admin":true}}');
    assert.equal(res.status, 400);
  });
});

describe("routing and health", () => {
  it("returns a JSON 404 without leaking internals", async () => {
    const res = await fetch(`${baseUrl}/does-not-exist`);
    assert.equal(res.status, 404);
    const body = (await res.json()) as { error: { code: string; requestId: string; stack?: unknown } };
    assert.equal(body.error.code, "NOT_FOUND");
    assert.ok(body.error.requestId);
    assert.equal(body.error.stack, undefined);
  });

  it("reports readiness per dependency", async () => {
    redisUp = false;
    const down = await fetch(`${baseUrl}/health/ready`);
    assert.equal(down.status, 503);
    assert.deepEqual(await down.json(), { status: "unavailable", checks: { mongo: "up", redis: "down" } });

    redisUp = true;
    const up = await fetch(`${baseUrl}/health/ready`);
    assert.equal(up.status, 200);
  });
});

describe("rate limiting", () => {
  it("returns 429 with Retry-After once the limit is exceeded", async () => {
    let last: Response | undefined;
    for (let i = 0; i <= RATE_LIMIT_MAX; i += 1) last = await fetch(`${baseUrl}/health/live`);
    assert.equal(last?.status, 429);
    assert.ok(last?.headers.get("retry-after"));
  });

  it("groups IPv6 clients by /64", () => {
    assert.equal(clientKey("2001:db8:1:2:aaaa::1"), "2001:0db8:0001:0002::/64");
    assert.equal(clientKey("2001:db8:1:2::ffff"), clientKey("2001:db8:1:2:1:2:3:4"));
    assert.equal(clientKey("::ffff:10.0.0.1"), "10.0.0.1");
  });
});
