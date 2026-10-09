
import assert from "node:assert/strict";
import test from "node:test";
import {
  hashPassword,
  verifyPassword,
} from "../utils/password.js";

test("hashes a password using a verifiable hash", async () => {
  const password = "Correct-Horse-Battery-42!";
  const hash = await hashPassword(password);

  assert.notEqual(hash, password);
  assert.ok(hash.startsWith("$argon2id$"));
  assert.equal(await verifyPassword(password, hash), true);
});

test("different password inputs produce different hashes", async () => {
  const password = "Correct-Horse-Battery-42!";

  const firstHash = await hashPassword(password);
  const secondHash = await hashPassword(password);

  assert.notEqual(firstHash, secondHash);
  assert.equal(await verifyPassword(password, firstHash), true);
  assert.equal(await verifyPassword("Wrong-Password-42!", firstHash), false);
});

test("invalid password hashes do not verify", async () => {
  assert.equal(await verifyPassword("some-password", "invalid-hash"), false);
});
