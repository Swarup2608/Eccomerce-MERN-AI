import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { after, before, describe, it } from "node:test";
import { Redis } from "ioredis";
import { createApp } from "../app.js";
import { createLogger } from "../lib/logger.js";
import { MemoryRateLimitStore, clientKey } from "../middleware/rate-limit.js";
import { scopePolicies } from "../modules/auth/auth.policy.js";
import { AuthService } from "../modules/auth/auth.service.js";
import { signAccessToken } from "../utils/tokens.js";

const ALLOWED_ORIGIN = "http://localhost:3000";
const RATE_LIMIT_MAX = 40;
const SECRETS = { user: "u".repeat(48), admin: "a".repeat(48) };

let server: Server;
let baseUrl: string;
let redisUp = true;
// Never connects: these tests only exercise paths that are rejected before any Redis call.
const redis = new Redis({ lazyConnect: true, enableOfflineQueue: false });

before(async () => {
  const policies = scopePolicies(false);
  const app = createApp({
    config: { corsOrigins: [ALLOWED_ORIGIN], trustProxy: 0, rateLimit: { windowMs: 60_000, max: RATE_LIMIT_MAX }, auth: { accessTokenSecret: SECRETS.user, adminAccessTokenSecret: SECRETS.admin, secureCookies: false } },
    logger: createLogger("error"),
    rateLimitStore: new MemoryRateLimitStore(),
    healthChecks: {
      mongo: () => Promise.resolve(),
      redis: () => (redisUp ? Promise.resolve() : Promise.reject(new Error("down"))),
    },
    authService: new AuthService(redis, policies, SECRETS, createLogger("error")),
  });
  server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", () => resolve()));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(async () => {
  redis.disconnect();
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

describe("auth guards", () => {
  it("rejects /me without an access cookie", async () => {
    const user = await fetch(`${baseUrl}/api/v1/auth/me`);
    const admin = await fetch(`${baseUrl}/api/v1/admin/auth/me`);
    assert.equal(user.status, 401);
    assert.equal(admin.status, 401);
  });

  it("rejects a user token presented as an admin token", async () => {
    const token = signAccessToken({ userId: "u1", role: "user", sessionId: "s1", scope: "user" }, SECRETS.user, 60);
    const res = await fetch(`${baseUrl}/api/v1/admin/auth/me`, { headers: { cookie: `adm_access=${token}` } });
    assert.equal(res.status, 401);
  });

  it("rejects a forged admin token signed with the wrong secret", async () => {
    const token = signAccessToken({ userId: "u1", role: "admin", sessionId: "s1", scope: "admin" }, SECRETS.user, 60);
    const res = await fetch(`${baseUrl}/api/v1/admin/auth/me`, { headers: { cookie: `adm_access=${token}` } });
    assert.equal(res.status, 401);
  });

  it("rejects registration that tries to set its own role", async () => {
    const res = await postJson("/api/v1/auth/register", JSON.stringify({ firstName: "A", lastName: "B", email: "a@b.co", userName: "abc", password: "a-long-password", role: "admin" }));
    assert.equal(res.status, 400);
  });

  it("validates registration input without echoing the password", async () => {
    const res = await postJson("/api/v1/auth/register", JSON.stringify({ firstName: "", lastName: "B", email: "nope", userName: "a", password: "short-pw" }));
    assert.equal(res.status, 400);
    const text = await res.text();
    assert.ok(!text.includes("short-pw"));
  });

  it("has no admin registration endpoint", async () => {
    const res = await postJson("/api/v1/admin/auth/register", "{}");
    assert.equal(res.status, 404);
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
