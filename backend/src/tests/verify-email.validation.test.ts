
import test from "node:test";
import assert from "node:assert/strict";

import { verifyEmailSchema } from "../module/User/user.validation.js";

test("verify-email accepts a non-empty token", () => {
  const result = verifyEmailSchema.safeParse({
    token: "valid-looking-verification-token",
  });

  assert.equal(result.success, true);
});

test("verify-email rejects a missing token", () => {
  const result = verifyEmailSchema.safeParse({});

  assert.equal(result.success, false);
});

test("verify-email rejects an empty token", () => {
  const result = verifyEmailSchema.safeParse({
    token: "   ",
  });

  assert.equal(result.success, false);
});

test("verify-email rejects unexpected fields", () => {
  const result = verifyEmailSchema.safeParse({
    token: "valid-looking-verification-token",
    email: "someone@example.com",
  });

  assert.equal(result.success, false);
});
