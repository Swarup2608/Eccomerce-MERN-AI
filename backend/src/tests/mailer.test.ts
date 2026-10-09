
import assert from "node:assert/strict";
import test from "node:test";
import { AppError } from "../errors/AppError.js";
import { buildVerificationEmailContent } from "../utils/mailer.js";

test("verification email contains a usable verification link", () => {
  const url = "https://example.com/verify-email?token=abc123";
  const content = buildVerificationEmailContent(url);

  assert.equal(content.subject, "Verify your email address");
  assert.ok(content.text.includes(url));
  assert.ok(content.html.includes("Verify email address"));
  assert.ok(content.html.includes("https://example.com/verify-email"));
});

test("verification email escapes HTML-sensitive characters in its URL", () => {
  const content = buildVerificationEmailContent(
    "https://example.com/verify-email?token=abc123&source=test",
  );

  assert.ok(content.html.includes("&amp;source=test"));
});

test("verification email rejects invalid URLs", () => {
  assert.throws(
    () => buildVerificationEmailContent("not-a-url"),
    (error: unknown) =>
      error instanceof AppError &&
      error.statusCode === 400 &&
      error.code === "INVALID_VERIFICATION_URL",
  );
});

test("verification email rejects non-HTTP protocols", () => {
  assert.throws(
    () => buildVerificationEmailContent("javascript:alert(1)"),
    (error: unknown) =>
      error instanceof AppError &&
      error.code === "INVALID_VERIFICATION_URL",
  );
});
