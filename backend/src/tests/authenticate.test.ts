import assert from "node:assert/strict";
import { test } from "node:test";
import type { NextFunction, Request, Response } from "express";

import { AppError } from "../errors/AppError.js";
import { createAuthenticate, type AuthenticateDependencies } from "../middleware/authenticate.js";
import { SUPER_ADMIN_IDENTITY_ID } from "../module/User/super-admin.constants.js";
import type { AccessTokenPayload } from "../utils/jwt.js";

const USER_ID = "64b7f0c2a1b2c3d4e5f60718";

function buildDependencies(overrides: Partial<AuthenticateDependencies> = {}): AuthenticateDependencies {
  return {
    verifyAccessToken: () => ({ sub: USER_ID, sid: "session-1", type: "access" }) as AccessTokenPayload,
    getSession: async (sessionId) => ({ sessionId, userId: USER_ID, refreshTokenId: "refresh-1", createdAt: new Date().toISOString() }),
    findUser: async () => ({ role: "user", status: "active" }),
    isSuperAdminConfigured: () => true,
    ...overrides,
  };
}

async function run(dependencies: AuthenticateDependencies, cookies: Record<string, string> = { accessToken: "token" }) {
  const req = { cookies } as unknown as Request;
  const res = { locals: {} } as Response;
  let nextArg: unknown = "not-called";

  await createAuthenticate(dependencies)(req, res, ((error?: unknown) => {
    nextArg = error;
  }) as NextFunction);

  return { locals: res.locals, error: nextArg };
}

test("authenticate rejects a request without an access token", async () => {
  const { error } = await run(buildDependencies(), {});

  assert.ok(error instanceof AppError);
  assert.equal(error.code, "AUTHENTICATION_REQUIRED");
});

test("authenticate accepts an active user with a live session", async () => {
  const { error, locals } = await run(buildDependencies());

  assert.equal(error, undefined);
  assert.deepEqual(locals.user, { userId: USER_ID, sessionId: "session-1", role: "user" });
});

test("authenticate rejects a token whose session was revoked", async () => {
  const { error } = await run(buildDependencies({ getSession: async () => null }));

  assert.ok(error instanceof AppError);
  assert.equal(error.code, "SESSION_REVOKED");
});

test("authenticate rejects a session that belongs to another identity", async () => {
  const { error } = await run(
    buildDependencies({
      getSession: async (sessionId) => ({ sessionId, userId: "someone-else", refreshTokenId: "r", createdAt: new Date().toISOString() }),
    }),
  );

  assert.ok(error instanceof AppError);
  assert.equal(error.code, "SESSION_REVOKED");
});

test("authenticate rejects an inactive user", async () => {
  const { error } = await run(buildDependencies({ findUser: async () => ({ role: "user", status: "suspended" }) }));

  assert.ok(error instanceof AppError);
  assert.equal(error.code, "ACCOUNT_INACTIVE");
});

test("authenticate recognises the Super Admin without a database lookup", async () => {
  let lookedUp = false;
  const { error, locals } = await run(
    buildDependencies({
      verifyAccessToken: () => ({ sub: SUPER_ADMIN_IDENTITY_ID, sid: "session-sa", type: "access" }) as AccessTokenPayload,
      getSession: async (sessionId) => ({ sessionId, userId: SUPER_ADMIN_IDENTITY_ID, refreshTokenId: "r", createdAt: new Date().toISOString() }),
      findUser: async () => {
        lookedUp = true;
        return null;
      },
    }),
  );

  assert.equal(error, undefined);
  assert.equal(lookedUp, false);
  assert.deepEqual(locals.user, { userId: SUPER_ADMIN_IDENTITY_ID, sessionId: "session-sa", role: "super_admin" });
});

test("authenticate rejects the Super Admin when it is no longer configured", async () => {
  const { error } = await run(
    buildDependencies({
      verifyAccessToken: () => ({ sub: SUPER_ADMIN_IDENTITY_ID, sid: "session-sa", type: "access" }) as AccessTokenPayload,
      getSession: async (sessionId) => ({ sessionId, userId: SUPER_ADMIN_IDENTITY_ID, refreshTokenId: "r", createdAt: new Date().toISOString() }),
      isSuperAdminConfigured: () => false,
    }),
  );

  assert.ok(error instanceof AppError);
  assert.equal(error.code, "ACCOUNT_INACTIVE");
});

test("authenticate passes token verification errors through", async () => {
  const { error } = await run(
    buildDependencies({
      verifyAccessToken: () => {
        throw new AppError("Invalid or expired access token.", 401, "INVALID_ACCESS_TOKEN");
      },
    }),
  );

  assert.ok(error instanceof AppError);
  assert.equal(error.code, "INVALID_ACCESS_TOKEN");
});
