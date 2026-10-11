import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import dotenv from "dotenv";

import { parseEnv } from "../config/env.js";

const requiredEnv = {
  MONGO_URI: "mongodb://localhost:27017/app",
  REDIS_URL: "redis://localhost:6379",
  JWT_ACCESS_SECRET: "a".repeat(32),
  JWT_REFRESH_SECRET: "b".repeat(32),
  CORS_ORIGIN: "http://localhost:3000",
};

const example = dotenv.parse(readFileSync(new URL("../../.env.example", import.meta.url)));

function issuePaths(result: ReturnType<typeof parseEnv>): string[] {
  return result.success ? [] : result.error.issues.map((issue) => issue.path.join("."));
}

test(".env.example boots once the required secrets are filled in", () => {
  const result = parseEnv({ ...example, JWT_ACCESS_SECRET: requiredEnv.JWT_ACCESS_SECRET, JWT_REFRESH_SECRET: requiredEnv.JWT_REFRESH_SECRET });

  assert.deepEqual(issuePaths(result), []);
});

test(".env.example documents the test database and no Super Admin credentials", () => {
  assert.ok("MONGO_TEST_URI" in example, "MONGO_TEST_URI is missing from .env.example");
  assert.equal(Object.keys(example).some((key) => key.startsWith("SUPER_ADMIN")), false, "the Super Admin lives in MongoDB, not env");
});

test("blank optional settings are treated as unset", () => {
  const result = parseEnv({ ...requiredEnv, SMTP_HOST: "", EMAIL_FROM: "  ", DATA_ENCRYPTION_KEY: "", CLOUDINARY_API_KEY: "" });

  assert.deepEqual(issuePaths(result), []);
  assert.equal(result.data?.SMTP_HOST, undefined);
  assert.equal(result.data?.EMAIL_FROM, undefined);
});

test("a blank required setting is still rejected", () => {
  const result = parseEnv({ ...requiredEnv, MONGO_URI: "" });

  assert.deepEqual(issuePaths(result), ["MONGO_URI"]);
});

test("a malformed optional setting is still rejected", () => {
  const result = parseEnv({ ...requiredEnv, EMAIL_FROM: "not-an-email" });

  assert.deepEqual(issuePaths(result), ["EMAIL_FROM"]);
});
