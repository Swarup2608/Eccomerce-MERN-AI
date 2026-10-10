import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";

import { signCloudinaryParams } from "../utils/cloudinary.js";
import { decryptString, encryptString, isEncrypted, maskTail } from "../utils/encryption.js";
import { toObjectId } from "../utils/ids.js";
import { allocateEvenly, allocateProportionally, percentOf, roundMoney, sumMoney } from "../utils/money.js";

test("money helpers avoid floating-point drift", () => {
  assert.equal(sumMoney([0.1, 0.2]), 0.3);
  assert.equal(roundMoney(10.005), 10.01);
  assert.equal(percentOf(999, 10), 99.9);
  assert.equal(percentOf(333.33, 12.5), 41.67);
});

test("proportional allocation always sums to the total", () => {
  const parts = allocateProportionally(100, [1, 1, 1]);

  assert.equal(sumMoney(parts), 100);
  assert.deepEqual(parts, [33.34, 33.33, 33.33]);
  assert.deepEqual(allocateProportionally(50, [300, 100]), [37.5, 12.5]);
  assert.deepEqual(allocateProportionally(10, [0, 0]), [5, 5]);
  assert.deepEqual(allocateProportionally(10, []), []);
});

test("even allocation spreads the remainder", () => {
  assert.deepEqual(allocateEvenly(49, 3), [16.34, 16.33, 16.33]);
  assert.equal(sumMoney(allocateEvenly(49, 3)), 49);
});

test("encryption round-trips and never stores plain text", () => {
  const encrypted = encryptString("123456789012");

  assert.ok(isEncrypted(encrypted));
  assert.ok(!encrypted.includes("123456789012"));
  assert.equal(decryptString(encrypted), "123456789012");
  assert.notEqual(encryptString("123456789012"), encrypted, "IV must make ciphertexts unique");
});

test("tampered ciphertext is rejected", () => {
  const [version, iv, tag, data] = encryptString("secret").split(":");
  const tampered = [version, iv, tag, Buffer.from("xxxxxx").toString("base64") + data].join(":");

  assert.throws(() => decryptString(tampered));
});

test("maskTail keeps only the last characters", () => {
  assert.equal(maskTail("123456789012"), "••••••••9012");
  assert.equal(maskTail("123"), "123");
});

test("cloudinary signatures sort parameters and append the secret", () => {
  const signature = signCloudinaryParams({ timestamp: 1700000000, folder: "products" }, "secret");
  const expected = createHash("sha1").update("folder=products&timestamp=1700000000secret").digest("hex");

  assert.equal(signature, expected);
});

test("toObjectId rejects malformed and non-hex identifiers", () => {
  assert.equal(toObjectId("64b7f0c2a1b2c3d4e5f60718").toString(), "64b7f0c2a1b2c3d4e5f60718");
  assert.throws(() => toObjectId("env:super-admin"));
  assert.throws(() => toObjectId("abcdefghijkl"));
});
