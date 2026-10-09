import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
const TOKEN_BYTES = 32;

export function generateEmailVerificationToken(): string {
  return randomBytes(TOKEN_BYTES).toString("hex");
}

export function hashEmailVerificationToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function emailVerificationTokensMatch( providedToken: string, storedToken: string): boolean {
  if(!/^[a-f0-9]{64}$/i.test(providedToken)) {
    return false;
  }
  const providedTokenHash = Buffer.from(hashEmailVerificationToken(providedToken), "hex");
  const storedTokenHash = Buffer.from(storedToken, "hex");
  return (providedTokenHash.length === storedTokenHash.length) && timingSafeEqual(providedTokenHash, storedTokenHash);
}