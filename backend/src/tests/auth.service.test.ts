
import { randomUUID } from "node:crypto";
import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import mongoose, { Types } from "mongoose";

import { AppError } from "../errors/AppError.js";
import { registerUser, loginUser, refreshUserSession, type RegisterUserDependencies, type LoginUserDependencies, type RefreshTokenDependencies } from "../module/User/auth.service.js";
import { EmailVerification } from "../module/User/email-verification.model.js";
import { User } from "../module/User/user.model.js";
import { USER_ROLES, USER_STATUSES, type RegisterUserInput, type LoginUserInput } from "../module/User/user.validation.js";
import type {RefreshTokenPayload} from "../utils/jwt.js";
import type { SessionRecord } from "../utils/session.js";

const mongoTestUri = process.env.MONGO_TEST_URI;

if (!mongoTestUri) {
  throw new Error("MONGO_TEST_URI must be configured to run auth service tests.");
}

if (!mongoTestUri.includes("Testing")) {
  throw new Error(
    "MONGO_TEST_URI must point to an isolated Testing database.",
  );
}

function buildInput( overrides: Partial<RegisterUserInput> = {}): RegisterUserInput {
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

function createDependencies( overrides: Partial<RegisterUserDependencies> = {}, ): RegisterUserDependencies {
  return {
    hashPassword: async (password: string) => `hashed:${password}`,
    sendEmailVerification: async (_userId: Types.ObjectId) => {},
    ...overrides,
  };
}

function buildLoginInput(overrides: Partial<LoginUserInput> = {}): LoginUserInput {
  return {
    identifier: "test@example.com",
    password: "test-password-123",
    ...overrides,
  };
}

function createLoginDependencies(overrides: Partial<LoginUserDependencies> = {}): LoginUserDependencies {
  return {
    findUser : async (identifier) => {
      return User.findOne({
        $or : [{email: identifier}, {userName: identifier}]
      }).select("+passwordHash");
    },
    verifyPassword: async (password, passwordHash) => passwordHash === `hashed:${password}`,
    createSession: async (userId) => ({ sessionId: randomUUID(), userId, refreshTokenId: randomUUID(), createdAt: new Date().toISOString() }),
    revokeSession: async (_sessionId) => {},
    signAccessToken: (_userId, _sessionId) => "test-access-token",
    signRefreshToken: (_userId, _sessionId, _refreshTokenId) => "test-refresh-token",
    updateLastLogin: async (userId) => {
       await User.updateOne(
        { _id: userId },
        { $set: { lastLoginAt: new Date() } },
      );
    },

    ...overrides,
  };
}

const refreshTestPayload: RefreshTokenPayload = {
  sub: "test-user-id",
  sid: "test-session-id",
  jti: "test-refresh-token-id",
  type: "refresh",
};

const refreshTestSession: SessionRecord = {
  sessionId: "test-session-id",
  userId: "test-user-id",
  refreshTokenId: "test-refresh-token-id",
  createdAt: new Date().toISOString(),
};

function createRefreshDependencies(overrides: Partial<RefreshTokenDependencies> = {}): RefreshTokenDependencies {
  return {
    randomUUID: () => "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    verifyRefreshToken: (_token) => refreshTestPayload,
    getSession: async (_sessionId) => refreshTestSession,
    findUser: async (_userId) => ({
      status: USER_STATUSES.ACTIVE,
      emailVerified: true,
    }),
    revokeSession: async (_sessionId) => {},
    rotateSessionRefreshToken: async (_sessionId, _currentTokenId, _nextTokenId) => true,
    signAccessToken: (_userId, _sessionId) => "new-access-token",
    signRefreshToken: (_userId, _sessionId, _refreshTokenId) => "new-refresh-token",
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

test("loginUser logs in a verified user with email", async () => {
  const input = buildInput();

  const registeredUser = await User.create({
    firstName: input.firstName,
    lastName: input.lastName,
    email: input.email,
    userName: input.userName,
    passwordHash: `hashed:${input.password}`,
    emailVerified: true,
  });

  const result = await loginUser(
    buildLoginInput({
      identifier: input.email,
      password: input.password,
    }),
    createLoginDependencies(),
  );

  assert.equal(result.user.id, registeredUser._id.toString());
  assert.equal(result.user.email, input.email);
  assert.equal(result.accessToken, "test-access-token");
  assert.equal(result.refreshToken, "test-refresh-token");
  assert.equal("passwordHash" in result.user, false);
  assert.equal("password" in result.user, false);

  const updatedUser = await User.findById(registeredUser._id);
  assert.ok(updatedUser?.lastLoginAt);
});

test("loginUser logs in a verified user with username", async () => {
  const input = buildInput();

  await User.create({
    firstName: input.firstName,
    lastName: input.lastName,
    email: input.email,
    userName: input.userName,
    passwordHash: `hashed:${input.password}`,
    emailVerified: true,
  });

  const result = await loginUser(
    buildLoginInput({
      identifier: input.userName.toUpperCase(),
      password: input.password,
    }),
    createLoginDependencies(),
  );

  assert.equal(result.user.userName, input.userName);
});

test("loginUser rejects an unknown user with INVALID_CREDENTIALS", async () => {
  await assert.rejects(
    loginUser(
      buildLoginInput({
        identifier: "unknown@example.com",
      }),
      createLoginDependencies(),
    ),
    (error: unknown) => {
      assert.ok(error instanceof AppError);
      assert.equal(error.statusCode, 401);
      assert.equal(error.code, "INVALID_CREDENTIALS");
      return true;
    },
  );
});

test("loginUser rejects an incorrect password with INVALID_CREDENTIALS", async () => {
  const input = buildInput();

  await User.create({
    firstName: input.firstName,
    lastName: input.lastName,
    email: input.email,
    userName: input.userName,
    passwordHash: `hashed:${input.password}`,
    emailVerified: true,
  });

  await assert.rejects(
    loginUser(
      buildLoginInput({
        identifier: input.email,
        password: "wrong-password",
      }),
      createLoginDependencies(),
    ),
    (error: unknown) => {
      assert.ok(error instanceof AppError);
      assert.equal(error.statusCode, 401);
      assert.equal(error.code, "INVALID_CREDENTIALS");
      return true;
    },
  );
});

test("loginUser rejects an unverified email", async () => {
  const input = buildInput();

  await User.create({
    firstName: input.firstName,
    lastName: input.lastName,
    email: input.email,
    userName: input.userName,
    passwordHash: `hashed:${input.password}`,
    emailVerified: false,
  });

  await assert.rejects(
    loginUser(
      buildLoginInput({
        identifier: input.email,
        password: input.password,
      }),
      createLoginDependencies(),
    ),
    (error: unknown) => {
      assert.ok(error instanceof AppError);
      assert.equal(error.statusCode, 403);
      assert.equal(error.code, "EMAIL_NOT_VERIFIED");
      return true;
    },
  );
});

test("loginUser rejects an inactive account", async () => {
  const input = buildInput();

  await User.create({
    firstName: input.firstName,
    lastName: input.lastName,
    email: input.email,
    userName: input.userName,
    passwordHash: `hashed:${input.password}`,
    emailVerified: true,
    status: USER_STATUSES.INACTIVE,
  });

  await assert.rejects(
    loginUser(
      buildLoginInput({
        identifier: input.email,
        password: input.password,
      }),
      createLoginDependencies(),
    ),
    (error: unknown) => {
      assert.ok(error instanceof AppError);
      assert.equal(error.statusCode, 403);
      assert.equal(error.code, "ACCOUNT_NOT_ACTIVE");
      return true;
    },
  );
});

test("loginUser revokes the session if updating last login fails", async () => {
  const input = buildInput();

  await User.create({
    firstName: input.firstName,
    lastName: input.lastName,
    email: input.email,
    userName: input.userName,
    passwordHash: `hashed:${input.password}`,
    emailVerified: true,
  });

  let revokedSessionId: string | undefined;

  await assert.rejects(
    loginUser(
      buildLoginInput({
        identifier: input.email,
        password: input.password,
      }),
      createLoginDependencies({
        updateLastLogin: async () => {
          throw new Error("Database update failed");
        },
        revokeSession: async (sessionId) => {
          revokedSessionId = sessionId;
        },
      }),
    ),
    /Database update failed/,
  );

  assert.ok(revokedSessionId);
});

test("refreshUserSession rotates the refresh token successfully", async () => {
  let rotationArgs: string[] = [];

  const dependencies = createRefreshDependencies({
    randomUUID: () => "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    rotateSessionRefreshToken: async (
      sessionId,
      currentTokenId,
      nextTokenId,
    ) => {
      rotationArgs = [sessionId, currentTokenId, nextTokenId];
      return true;
    },
  });

  const result = await refreshUserSession(
    "old-refresh-token",
    dependencies,
  );

  assert.deepEqual(result, {
    accessToken: "new-access-token",
    refreshToken: "new-refresh-token",
  });

  assert.deepEqual(rotationArgs, [
    "test-session-id",
    "test-refresh-token-id",
    "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  ]);
});

test("refreshUserSession rejects a missing session", async () => {
  const dependencies = createRefreshDependencies({
    getSession: async (_sessionId) => null,
  });

  await assert.rejects(
    refreshUserSession("old-refresh-token", dependencies),
    (error: unknown) =>
      error instanceof AppError &&
      error.code === "INVALID_REFRESH_TOKEN",
  );
});

test("refreshUserSession revokes a session for an inactive user", async () => {
  let revokedSessionId: string | undefined;

  const dependencies = createRefreshDependencies({
    findUser: async (_userId) => ({
      status: "inactive",
      emailVerified: true,
    }),
    revokeSession: async (sessionId) => {
      revokedSessionId = sessionId;
    },
  });

  await assert.rejects(
    refreshUserSession("old-refresh-token", dependencies),
    (error: unknown) =>
      error instanceof AppError &&
      error.code === "INVALID_REFRESH_TOKEN",
  );

  assert.equal(revokedSessionId, refreshTestPayload.sid);
});

test("refreshUserSession rejects a refresh token when rotation fails", async () => {
  const dependencies = createRefreshDependencies({
    rotateSessionRefreshToken: async (
      _sessionId,
      _currentTokenId,
      _nextTokenId,
    ) => false,
  });

  await assert.rejects(
    refreshUserSession("old-refresh-token", dependencies),
    (error: unknown) =>
      error instanceof AppError &&
      error.code === "INVALID_REFRESH_TOKEN",
  );
});