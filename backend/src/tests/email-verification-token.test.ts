import assert from "node:assert/strict";
import test from "node:test";

import { generateEmailVerificationToken, hashEmailVerificationToken, emailVerificationTokensMatch } from "../module/User/email-verification.token.js";

test("generates a cryptographically random token in hex format", () => {
    const token = generateEmailVerificationToken();

    assert.match(token, /^[a-f0-9]{64}$/);
});

test("generates different tokens on separate calls", () => {
    const first = generateEmailVerificationToken();
    const second = generateEmailVerificationToken();

    assert.notEqual(first, second);
});

test("hashing the same token is deterministic", () => {
    const token = generateEmailVerificationToken();

    assert.equal(
        hashEmailVerificationToken(token),
        hashEmailVerificationToken(token),
    );
});

test("does not store the raw token as its hash", () => {
    const token = generateEmailVerificationToken();

    assert.notEqual(hashEmailVerificationToken(token), token);
});

test("matches a token against its stored hash", () => {
    const token = generateEmailVerificationToken();
    const hash = hashEmailVerificationToken(token);

    assert.equal(emailVerificationTokensMatch(token, hash), true);
});

test("rejects an incorrect token", () => {
    const token = generateEmailVerificationToken();
    const hash = hashEmailVerificationToken(token);

    assert.equal(emailVerificationTokensMatch("wrong-token", hash), false);
});

test("rejects malformed stored hashes", () => {
    assert.equal(emailVerificationTokensMatch("anything", "invalid"), false);
});