import { randomBytes } from "node:crypto";
import argon2 from "argon2";

export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, { type: argon2.argon2id });
}

// A throwaway hash, so a missing account costs the same time as a wrong password and timing can't reveal which emails exist.
let dummyHash: Promise<string> | undefined;

export async function verifyPassword(password: string, passwordHash: string | undefined): Promise<boolean> {
  try {
    if (passwordHash === undefined) {
      dummyHash ??= hashPassword(randomBytes(32).toString("hex"));
      await argon2.verify(await dummyHash, password);
      return false;
    }
    return await argon2.verify(passwordHash, password);
  } catch {
    return false;
  }
}
