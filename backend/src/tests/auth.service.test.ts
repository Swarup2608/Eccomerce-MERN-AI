
import { randomUUID } from "node:crypto";
import {
  after,
  before,
  beforeEach,
  test,
} from "node:test";
import assert from "node:assert/strict";
import mongoose, { Types } from "mongoose";

import { AppError } from "../errors/AppError.js";
import {
  registerUser,
  type RegisterUserDependencies,
} from "../module/User/auth.service.js";
import { EmailVerification } from "../module/User/email-verification.model.js";
import { User } from "../module/User/user.model.js";
import {
  USER_ROLES,
  USER_STATUSES,
  type RegisterUserInput,
} from "../module/User/user.validation.js";

const mongoTestUri = process.env.MONGO_TEST_URI;
console.log(mongoTestUri);

if (!mongoTestUri) {
  throw new Error("MONGO_TEST_URI must be configured to run auth service tests.");
}

if (!mongoTestUri.includes("Testing")) {
  throw new Error(
    "MONGO_TEST_URI must point to an isolated Testing database.",
  );
}

function buildInput(
  overrides: Partial<RegisterUserInput> = {},
): RegisterUserInput {
  const id = randomUUID().replaceAll("-", "");

  return {
    firstName: "Test",
    lastName: "User",
    email: `${id}@example.com`,
    userName: `test_${id.slice(0, 20)}`,
    password: "test-password-123",
    ...overrides,
  };
}

function createDependencies(
  overrides: Partial<RegisterUserDependencies> = {},
): RegisterUserDependencies {
  return {
    hashPassword: async (password: string) => `hashed:${password}`,
    sendEmailVerification: async (_userId: Types.ObjectId) => {},
    ...overrides,
  };
}

before(async () => {
  await mongoose.connect(mongoTestUri!);
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

test("registerUser creates an unverified user and sends verification email", async () => {
  const input = buildInput();
  let sentUserId: Types.ObjectId | undefined;

  const dependencies = createDependencies({
    sendEmailVerification: async (userId) => {
      sentUserId = userId;
    },
  });

  const result = await registerUser(input, dependencies);

  assert.equal(result.email, input.email);
  assert.equal(result.userName, input.userName);
  assert.equal(result.emailVerified, false);
  assert.equal(result.phoneVerified, false);
  assert.equal(result.role, USER_ROLES.USER);
  assert.equal(result.status, USER_STATUSES.ACTIVE);
  assert.ok(sentUserId);
  assert.equal(result.id, sentUserId.toString());

  assert.equal("password" in result, false);
  assert.equal("passwordHash" in result, false);

  const storedUser = await User.findById(result.id).select("+passwordHash");

  assert.ok(storedUser);
  assert.equal(storedUser.passwordHash, `hashed:${input.password}`);
  assert.equal(storedUser.emailVerified, false);
});

test("registerUser maps duplicate email errors to ACCOUNT_ALREADY_EXISTS", async () => {
  const input = buildInput();

  await User.create({
    firstName: input.firstName,
    lastName: input.lastName,
    email: input.email,
    userName: input.userName,
    passwordHash: "existing-hash",
  });

  const duplicateInput = buildInput({
    email: input.email,
  });

  await assert.rejects(
    registerUser(duplicateInput, createDependencies()),
    (error: unknown) => {
      assert.ok(error instanceof AppError);
      assert.equal(error.statusCode, 409);
      assert.equal(error.code, "ACCOUNT_ALREADY_EXISTS");
      return true;
    },
  );
});

test("registerUser maps duplicate userName errors to ACCOUNT_ALREADY_EXISTS", async () => {
  const input = buildInput();

  await User.create({
    firstName: input.firstName,
    lastName: input.lastName,
    email: input.email,
    userName: input.userName,
    passwordHash: "existing-hash",
  });

  const duplicateInput = buildInput({
    userName: input.userName,
  });

  await assert.rejects(
    registerUser(duplicateInput, createDependencies()),
    (error: unknown) => {
      assert.ok(error instanceof AppError);
      assert.equal(error.statusCode, 409);
      assert.equal(error.code, "ACCOUNT_ALREADY_EXISTS");
      return true;
    },
  );
});

test("registerUser removes an unverified account when email delivery fails", async () => {
  const input = buildInput();
  const deliveryError = new AppError(
    "Email delivery is not configured.",
    503,
    "EMAIL_NOT_CONFIGURED",
  );

  await assert.rejects(
    registerUser(
      input,
      createDependencies({
        sendEmailVerification: async () => {
          throw deliveryError;
        },
      }),
    ),
    (error: unknown) => {
      assert.equal(error, deliveryError);
      return true;
    },
  );

  const storedUser = await User.findOne({ email: input.email });

  assert.equal(storedUser, null);
});
