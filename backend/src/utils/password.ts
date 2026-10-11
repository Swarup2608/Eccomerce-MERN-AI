import { randomBytes } from "node:crypto";
import { argon2id, hash, verify } from "argon2";

// OWASP-recommended argon2id parameters (19 MiB, 2 iterations, 1 lane).
const ARGON2_OPTIONS = { type: argon2id, memoryCost: 19_456, timeCost: 2, parallelism: 1 } as const;

let dummyHash: Promise<string> | undefined;

export function hashPassword(password: string): Promise<string> {
  return hash(password, ARGON2_OPTIONS);
}

// When the account doesn't exist we still run a full verification against a throwaway hash,
// so response timing can't be used to discover which emails are registered.
export async function verifyPassword(passwordHash: string | undefined, password: string): Promise<boolean> {
  dummyHash ??= hash(randomBytes(32).toString("hex"), ARGON2_OPTIONS);
  const target = passwordHash ?? (await dummyHash);
  try {
    const matches = await verify(target, password);
    return passwordHash !== undefined && matches;
  } catch {
    return false;
  }
}
