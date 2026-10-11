import assert from "node:assert/strict";
import { describe, it } from "node:test";
import jwt from "jsonwebtoken";
import { formatRefreshToken, newRefreshSecret, newSessionId, parseRefreshToken, signAccessToken, verifyAccessToken } from "../utils/tokens.js";
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
    const token = jwt.sign({ sid: "s1", role: "superuser" }, SECRET, { subject: "u1", audience: "admin", issuer: "ecommerce-api" });
    assert.throws(() => verifyAccessToken(token, SECRET, "admin"));
  });
});

describe("refresh tokens", () => {
  it("parses only well-formed tokens", () => {
    const sessionId = newSessionId();
    const secret = newRefreshSecret();
    assert.deepEqual(parseRefreshToken(formatRefreshToken(sessionId, secret)), { sessionId, secret });
    assert.equal(parseRefreshToken("garbage"), null);
    assert.equal(parseRefreshToken(`${sessionId}.short`), null);
    assert.equal(parseRefreshToken(undefined), null);
  });
});

describe("passwords", () => {
  it("hashes with argon2id and verifies", async () => {
    const hash = await hashPassword("correct horse battery");
    assert.match(hash, /^\$argon2id\$/);
    assert.equal(await verifyPassword(hash, "correct horse battery"), true);
    assert.equal(await verifyPassword(hash, "wrong password!!"), false);
  });

  it("never succeeds for a missing account", async () => {
    assert.equal(await verifyPassword(undefined, "anything at all"), false);
  });
});
