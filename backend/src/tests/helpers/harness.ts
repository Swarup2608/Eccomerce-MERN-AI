import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { createServer as createNetServer, type AddressInfo } from "node:net";
import type { Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Redis } from "ioredis";
import mongoose from "mongoose";
import { createApp } from "../../app.js";
import "../../lib/mongo.js";
import { createLogger } from "../../lib/logger.js";
import type { Mail, Mailer } from "../../lib/mailer.js";
import { MemoryRateLimitStore } from "../../middleware/rate-limit.js";
import { AuditEvent, type AuditEventName } from "../../modules/audit/audit.model.js";
import type { AuditEntry, AuditRecorder } from "../../modules/audit/audit.service.js";
import { scopePolicies } from "../../modules/auth/auth.policy.js";
import { AuthService } from "../../modules/auth/auth.service.js";
import { User } from "../../modules/users/user.model.js";
import { COMMERCE_MODELS, createCommerce, type CommerceServices } from "../../modules/commerce.js";
import { MemoryStorage } from "../../lib/storage.js";

// CI provides service containers through these two variables; locally the harness starts redis-server and mongod itself.
const EXTERNAL = { redis: process.env.TEST_REDIS_URL, mongo: process.env.TEST_MONGODB_URI };

export const hasInfra = (): boolean => Boolean(EXTERNAL.redis && EXTERNAL.mongo) || ["redis-server", "mongod"].every((binary) => spawnSync("which", [binary]).status === 0);

export const ORIGIN = "http://localhost:3000";
export const ADMIN_ORIGIN = "http://localhost:3001";
export const SECRETS = { user: "u".repeat(48), admin: "a".repeat(48) };

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createNetServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const { port } = probe.address() as AddressInfo;
      probe.close(() => resolve(port));
    });
  });
}

async function waitFor(check: () => Promise<void>, what: string): Promise<void> {
  const deadline = Date.now() + 20_000;
  for (;;) {
    try {
      return await check();
    } catch (error) {
      if (Date.now() > deadline) throw new Error(`${what} did not start: ${String(error)}`);
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
  }
}

export class MemoryMailer implements Mailer {
  readonly sent: Mail[] = [];
  send(mail: Mail): Promise<void> {
    this.sent.push(mail);
    return Promise.resolve();
  }
  // The most recent email to an address, or undefined.
  last(to: string): Mail | undefined {
    return [...this.sent].reverse().find((mail) => mail.to === to);
  }
  tokenFor(to: string): string {
    const match = /token=([A-Za-z0-9_-]+)/.exec(this.last(to)?.text ?? "");
    if (!match?.[1]) throw new Error(`No emailed link for ${to}`);
    return match[1];
  }
}

export class MemoryAudit implements AuditRecorder {
  readonly events: { event: AuditEventName; entry: AuditEntry }[] = [];
  record(event: AuditEventName, entry: AuditEntry = {}): void {
    this.events.push({ event, entry });
  }
  count(event: AuditEventName): number {
    return this.events.filter((item) => item.event === event).length;
  }
}

export interface Infra {
  redis: Redis;
  stop(): Promise<void>;
}

// Real Redis and MongoDB on random ports in a temp dir, so the tests exercise the actual Lua scripts and unique indexes.
export async function startInfra(): Promise<Infra> {
  if (EXTERNAL.redis && EXTERNAL.mongo) return connectExternal(EXTERNAL.redis, EXTERNAL.mongo);
  const dir = mkdtempSync(join(tmpdir(), "auth-tests-"));
  const redisPort = await freePort();
  const mongoPort = await freePort();
  const children: ChildProcess[] = [
    spawn("redis-server", ["--port", String(redisPort), "--bind", "127.0.0.1", "--save", "", "--appendonly", "no", "--dir", dir], { stdio: "ignore" }),
    spawn("mongod", ["--dbpath", dir, "--port", String(mongoPort), "--bind_ip", "127.0.0.1", "--nounixsocket"], { stdio: "ignore" }),
  ];

  const redis = new Redis(redisPort, "127.0.0.1", { lazyConnect: true, maxRetriesPerRequest: 1 });
  redis.on("error", () => undefined); // expected while redis-server is still starting
  await waitFor(async () => {
    if (redis.status === "end") throw new Error("redis client ended");
    if (redis.status === "wait") await redis.connect();
    await redis.ping();
  }, "redis");
  await waitFor(async () => {
    await mongoose.connect(`mongodb://127.0.0.1:${mongoPort}`, { dbName: "auth_tests", serverSelectionTimeoutMS: 1_000 });
  }, "mongod");
  await Promise.all([User.createIndexes(), AuditEvent.createIndexes(), ...COMMERCE_MODELS.map((model) => model.createIndexes())]);

  return {
    redis,
    stop: async () => {
      await mongoose.disconnect();
      redis.disconnect();
      for (const child of children) child.kill("SIGKILL");
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

async function connectExternal(redisUrl: string, mongoUri: string): Promise<Infra> {
  const redis = new Redis(redisUrl, { maxRetriesPerRequest: 1 });
  await redis.flushdb();
  await mongoose.connect(mongoUri, { dbName: "auth_tests" });
  await mongoose.connection.dropDatabase();
  await Promise.all([User.createIndexes(), AuditEvent.createIndexes(), ...COMMERCE_MODELS.map((model) => model.createIndexes())]);
  return {
    redis,
    stop: async () => {
      await mongoose.disconnect();
      redis.disconnect();
    },
  };
}

export interface TestApp {
  baseUrl: string;
  mailer: MemoryMailer;
  audit: MemoryAudit;
  service: AuthService;
  commerce: CommerceServices;
  storage: MemoryStorage;
  stop(): Promise<void>;
}

export async function startApp(redis: Redis, options: { adminAllowedIps?: string[] } = {}): Promise<TestApp> {
  const mailer = new MemoryMailer();
  const audit = new MemoryAudit();
  const logger = createLogger("error");
  const service = new AuthService({ redis, policies: scopePolicies(false), secrets: SECRETS, storefrontUrl: ORIGIN, adminUrl: ADMIN_ORIGIN, logger, mailer, audit });
  const storage = new MemoryStorage();
  const commerce = createCommerce({ logger, audit, storage });
  const app = createApp({
    // trustProxy 1 lets each test client pick its own "IP" with X-Forwarded-For.
    config: { storefrontUrl: ORIGIN, adminUrl: ADMIN_ORIGIN, trustProxy: 1, rateLimit: { windowMs: 60_000, max: 100_000 }, auth: { accessTokenSecret: SECRETS.user, adminAccessTokenSecret: SECRETS.admin, secureCookies: false }, adminAllowedIps: options.adminAllowedIps ?? [] },
    logger,
    rateLimitStore: new MemoryRateLimitStore(),
    healthChecks: {},
    authService: service,
    audit,
    commerce,
  });
  const server: Server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", () => resolve()));
  return { baseUrl: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, mailer, audit, service, commerce, storage, stop: () => new Promise<void>((resolve) => server.close(() => resolve())) };
}

interface StoredCookie {
  value: string;
  path: string;
}

let clientCounter = 0;

// A browser stand-in: keeps cookies per name, honours Path and deletion, and has its own fake client IP.
export class Client {
  readonly jar = new Map<string, StoredCookie>();
  readonly ip: string;

  constructor(private readonly baseUrl: string, ip?: string) {
    clientCounter += 1;
    this.ip = ip ?? `10.${Math.floor(clientCounter / 250)}.${clientCounter % 250}.7`;
  }

  // Response bodies are untyped JSON; tests assert on their shape directly.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async request(method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE", path: string, body?: unknown): Promise<{ status: number; body: any }> {
    const cookie = [...this.jar].filter(([, stored]) => path.startsWith(stored.path)).map(([name, stored]) => `${name}=${stored.value}`).join("; ");
    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: { "x-forwarded-for": this.ip, ...(body === undefined ? {} : { "content-type": "application/json" }), ...(cookie ? { cookie } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    for (const line of res.headers.getSetCookie()) {
      const [pair = "", ...attributes] = line.split(";").map((part) => part.trim());
      const [name = "", value = ""] = pair.split("=");
      const path = attributes.find((attribute) => attribute.toLowerCase().startsWith("path="))?.slice(5) ?? "/";
      const expires = attributes.find((attribute) => attribute.toLowerCase().startsWith("expires="))?.slice(8);
      if (value === "" || (expires && new Date(expires).getTime() < Date.now())) this.jar.delete(name);
      else this.jar.set(name, { value, path });
    }
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : undefined };
  }

  post = (path: string, body?: unknown) => this.request("POST", path, body ?? {});
  get = (path: string) => this.request("GET", path);
  patch = (path: string, body?: unknown) => this.request("PATCH", path, body ?? {});
  put = (path: string, body?: unknown) => this.request("PUT", path, body ?? {});
  delete = (path: string) => this.request("DELETE", path);
  cookie = (name: string): string | undefined => this.jar.get(name)?.value;
  setCookie(name: string, value: string, path: string): void {
    this.jar.set(name, { value, path });
  }
}
