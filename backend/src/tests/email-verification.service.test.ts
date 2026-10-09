
import test, { before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { randomUUID } from "node:crypto";

import { User } from "../module/User/user.model.js";
import { EmailVerification } from "../module/User/email-verification.model.js";
import {
  verifyEmailToken,
} from "../module/User/email-verification.service.js";
import {
  hashEmailVerificationToken,
} from "../module/User/email-verification.token.js";

const mongoTestUri = process.env.MONGO_TEST_URI;

before(async () => {
  assert.ok(
    mongoTestUri,
    "MONGO_TEST_URI must be configured in backend/.env",
  );

  await mongoose.connect(mongoTestUri);
});

beforeEach(async () => {
  await EmailVerification.deleteMany({});
  await User.deleteMany({});
});

after(async () => {
  await EmailVerification.deleteMany({});
  await User.deleteMany({});
  await mongoose.disconnect();
});

async function createUnverifiedUser() {
  return User.create({
    firstName: "Test",
    lastName: "User",
    email: `${randomUUID()}@example.com`,
    userName: `test_${randomUUID().replaceAll("-", "").slice(0, 20)}`,
    passwordHash: "test-hash-not-used-for-login",
    emailVerified: false,
    phoneVerified: false,
  });
}

test("valid token verifies the user's email and consumes the token", async () => {
  const user = await createUnverifiedUser();
  const token = randomUUID();

  await EmailVerification.create({
    userId: user._id,
    tokenHash: hashEmailVerificationToken(token),
    expiresAt: new Date(Date.now() + 60_000),
    usedAt: null,
  });

  await verifyEmailToken(token);

  const updatedUser = await User.findById(user._id);
  const verification = await EmailVerification.findOne({
    userId: user._id,
  });

  assert.equal(updatedUser?.emailVerified, true);
  assert.ok(verification?.usedAt);
});

test("invalid token is rejected", async () => {
  await assert.rejects(
    verifyEmailToken("invalid-token"),
    { code: "INVALID_EMAIL_VERIFICATION_TOKEN" },
  );
});

test("expired token is rejected", async () => {
  const user = await createUnverifiedUser();
  const token = randomUUID();

  await EmailVerification.create({
    userId: user._id,
    tokenHash: hashEmailVerificationToken(token),
    expiresAt: new Date(Date.now() - 60_000),
    usedAt: null,
  });

  await assert.rejects(
    verifyEmailToken(token),
    { code: "INVALID_EMAIL_VERIFICATION_TOKEN" },
  );

  const unchangedUser = await User.findById(user._id);
  assert.equal(unchangedUser?.emailVerified, false);
});

test("a consumed token cannot be reused", async () => {
  const user = await createUnverifiedUser();
  const token = randomUUID();

  await EmailVerification.create({
    userId: user._id,
    tokenHash: hashEmailVerificationToken(token),
    expiresAt: new Date(Date.now() + 60_000),
    usedAt: null,
  });

  await verifyEmailToken(token);

  await assert.rejects(
    verifyEmailToken(token),
    { code: "INVALID_EMAIL_VERIFICATION_TOKEN" },
  );
});
