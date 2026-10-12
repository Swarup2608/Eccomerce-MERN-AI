import assert from "node:assert/strict";
import { describe, it } from "node:test";
import jwt from "jsonwebtoken";
import { newRefreshTokenId, newSessionId, signAccessToken, signRefreshToken, verifyAccessToken, verifyRefreshToken } from "../utils/tokens.js";
import { hashPassword, verifyPassword } from "../utils/password.js";

const SECRET = "s".repeat(48);

describe("access tokens", () => {
  it("round-trips claims for the right scope", () => {
    const token = signAccessToken({ userId: "u1", role: "admin", sessionId: "s1", scope: "admin" }, SECRET, 60);
    assert.deepEqual(verifyAccessToken(token, SECRET, "admin"), { userId: "u1", role: "admin", sessionId: "s1", scope: "admin" });
  });

  it("rejects the wrong audience", () => {
    const token = signAccessToken({ userId: "u1", role: "user", sessionId: "s1", scope: "user" }, SECRET, 60);
    assert.throws(() => verifyAccessToken(token, SECRET, "admin"));
  });

  it("rejects alg=none and expired tokens", () => {
    const unsigned = jwt.sign({ sid: "s1", role: "admin" }, "", { algorithm: "none", subject: "u1", audience: "admin", issuer: "ecommerce-api" });
    assert.throws(() => verifyAccessToken(unsigned, SECRET, "admin"));

    const expired = jwt.sign({ sid: "s1", role: "admin", exp: Math.floor(Date.now() / 1000) - 10 }, SECRET, { subject: "u1", audience: "admin", issuer: "ecommerce-api" });
    assert.throws(() => verifyAccessToken(expired, SECRET, "admin"), jwt.TokenExpiredError);
  });

  it("rejects an unknown role claim", () => {
    const token = jwt.sign({ sid: "s1", role: "superuser", type: "access" }, SECRET, { subject: "u1", audience: "admin", issuer: "ecommerce-api" });
    assert.throws(() => verifyAccessToken(token, SECRET, "admin"));
  });
});

describe("refresh tokens", () => {
  const claims = { userId: "u1", sessionId: newSessionId(), tokenId: newRefreshTokenId(), scope: "user" as const };

  it("round-trips and is scoped to its audience and secret", () => {
    const token = signRefreshToken(claims, SECRET, 60);
    assert.deepEqual(verifyRefreshToken(token, SECRET, "user"), { userId: "u1", sessionId: claims.sessionId, tokenId: claims.tokenId });
    assert.throws(() => verifyRefreshToken(token, SECRET, "admin"));
    assert.throws(() => verifyRefreshToken(token, "x".repeat(48), "user"));
    assert.throws(() => verifyRefreshToken("garbage", SECRET, "user"));
  });

  it("is never accepted as an access token, nor an access token as a refresh token", () => {
    assert.throws(() => verifyAccessToken(signRefreshToken(claims, SECRET, 60), SECRET, "user"));
    assert.throws(() => verifyRefreshToken(signAccessToken({ userId: "u1", role: "user", sessionId: "s1", scope: "user" }, SECRET, 60), SECRET, "user"));
  });

  it("can name its session after expiring, but only when asked", () => {
    const expired = jwt.sign({ sid: "s1", jti: "t1", type: "refresh", exp: Math.floor(Date.now() / 1000) - 10 }, SECRET, { subject: "u1", audience: "user", issuer: "ecommerce-api" });
    assert.throws(() => verifyRefreshToken(expired, SECRET, "user"), jwt.TokenExpiredError);
    assert.equal(verifyRefreshToken(expired, SECRET, "user", { ignoreExpiration: true }).sessionId, "s1");
  });
});

describe("passwords", () => {
  it("hashes with argon2id and verifies", async () => {
    const hash = await hashPassword("correct horse battery");
    assert.match(hash, /^\$argon2id\$/);
    assert.equal(await verifyPassword("correct horse battery", hash), true);
    assert.equal(await verifyPassword("wrong password!!", hash), false);
  });

  it("never succeeds against a malformed hash", async () => {
    assert.equal(await verifyPassword("anything at all", "not-a-hash"), false);
  });
});
