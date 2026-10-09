
import assert from "node:assert/strict";
import test from "node:test";
import { env } from "../config/env.js";
import { buildEmailVerificationURL } from "../module/User/email-verification.service.js";

test("builds a frontend verification URL with an encoded token", () => {
  const token = "abc123+/=&xyz";
  const result = new URL(buildEmailVerificationURL(token));

  assert.equal(result.origin, new URL(env.STOREFRONT_URL).origin);
  assert.equal(result.pathname, "/verify-email");
  assert.equal(result.searchParams.get("token"), token);
});
