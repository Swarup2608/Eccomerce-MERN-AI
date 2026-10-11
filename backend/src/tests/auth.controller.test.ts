import assert from "node:assert/strict";
import { test } from "node:test";
import { Types } from "mongoose";
import type { NextFunction, Request, Response } from "express";

import { AppError } from "../errors/AppError.js";
import { createLogoutController, type LogoutDependencies } from "../module/User/auth.controller.js";
import { createGetCurrentUserController, type CurrentUserDependencies } from "../module/User/currentUser.controller.js";
import type { RefreshTokenPayload } from "../utils/jwt.js";

interface FakeResponse {
  locals: Record<string, unknown>;
  statusCode?: number;
  body?: { success: boolean; error?: { code: string }; data?: { user: Record<string, unknown> } };
  clearedCookies: string[];
}

async function invoke(handler: (req: Request, res: Response, next: NextFunction) => unknown, options: { cookies?: Record<string, string>; locals?: Record<string, unknown> } = {}) {
  const fake: FakeResponse = { locals: options.locals ?? {}, clearedCookies: [] };
  const res = {
    locals: fake.locals,
    status(code: number) {
      fake.statusCode = code;
      return this;
    },
    json(body: FakeResponse["body"]) {
      fake.body = body;
      return this;
    },
    clearCookie(name: string) {
      fake.clearedCookies.push(name);
      return this;
    },
  } as unknown as Response;
  let nextArg: unknown = "not-called";

  await handler({ cookies: options.cookies ?? {} } as Request, res, ((error?: unknown) => {
    nextArg = error;
  }) as NextFunction);

  return { ...fake, nextArg };
}

function logoutDependencies(overrides: Partial<LogoutDependencies> = {}): LogoutDependencies {
  return {
    verifyRefreshToken: () => ({ sub: "user-1", sid: "session-1", jti: "refresh-1", type: "refresh" }) as RefreshTokenPayload,
    revokeSession: async () => {},
    ...overrides,
  };
}

test("logout revokes the session named in the refresh token and clears both cookies", async () => {
  const revoked: string[] = [];
  const result = await invoke(createLogoutController(logoutDependencies({ revokeSession: async (sessionId) => { revoked.push(sessionId); } })), { cookies: { refreshToken: "token" } });

  assert.equal(result.statusCode, 200);
  assert.deepEqual(revoked, ["session-1"]);
  assert.deepEqual(result.clearedCookies.sort(), ["accessToken", "refreshToken"]);
});

test("logout without a refresh cookie still clears cookies and succeeds", async () => {
  let revokeCalled = false;
  const result = await invoke(createLogoutController(logoutDependencies({ revokeSession: async () => { revokeCalled = true; } })));

  assert.equal(result.statusCode, 200);
  assert.equal(revokeCalled, false);
  assert.deepEqual(result.clearedCookies.sort(), ["accessToken", "refreshToken"]);
});

test("logout ignores an invalid refresh token instead of failing", async () => {
  let revokeCalled = false;
  const dependencies = logoutDependencies({
    verifyRefreshToken: () => {
      throw new AppError("Invalid or expired refresh token.", 401, "INVALID_REFRESH_TOKEN");
    },
    revokeSession: async () => { revokeCalled = true; },
  });

  const result = await invoke(createLogoutController(dependencies), { cookies: { refreshToken: "tampered" } });

  assert.equal(result.statusCode, 200);
  assert.equal(revokeCalled, false);
});

test("logout reports a session store failure instead of claiming success", async () => {
  const failure = new Error("Redis unavailable");
  const result = await invoke(createLogoutController(logoutDependencies({ revokeSession: async () => Promise.reject(failure) })), { cookies: { refreshToken: "token" } });

  assert.equal(result.nextArg, failure);
  assert.equal(result.statusCode, undefined);
});

function currentUserDependencies(overrides: Partial<CurrentUserDependencies> = {}): CurrentUserDependencies {
  return {
    findUser: async () => null,
    ...overrides,
  };
}

for (const role of ["user", "super_admin"]) {
  test(`/auth/me returns a ${role} from the database`, async () => {
    const userId = new Types.ObjectId();
    const dependencies = currentUserDependencies({
      findUser: async (id) => (id === userId.toString() ? { _id: userId, firstName: "Test", lastName: "User", email: "test@example.com", userName: "test_user", role, status: "active", emailVerified: true, phoneVerified: false } : null),
    });

    const result = await invoke(createGetCurrentUserController(dependencies), { locals: { user: { userId: userId.toString() } } });

    assert.equal(result.statusCode, 200);
    assert.equal(result.body?.data?.user._id, userId.toString());
    assert.equal(result.body?.data?.user.role, role);
    assert.equal("passwordHash" in (result.body?.data?.user ?? {}), false);
  });
}

test("/auth/me reports a user that no longer exists", async () => {
  const result = await invoke(createGetCurrentUserController(currentUserDependencies()), { locals: { user: { userId: new Types.ObjectId().toString() } } });

  assert.equal(result.statusCode, 401);
  assert.equal(result.body?.error?.code, "USER_NOT_FOUND");
});

test("/auth/me requires an authenticated request", async () => {
  const result = await invoke(createGetCurrentUserController(currentUserDependencies()));

  assert.equal(result.statusCode, 401);
  assert.equal(result.body?.error?.code, "AUTHENTICATION_REQUIRED");
});
