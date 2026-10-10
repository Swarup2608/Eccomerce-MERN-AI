import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { env } from "../config/env.js";

const ALGORITHM = "aes-256-gcm";
const VERSION = "v1";

// Production requires DATA_ENCRYPTION_KEY (enforced in env.ts). Outside production a
// key is derived from the refresh secret so local setups work without extra config.
function getKey(): Buffer {
    if (env.DATA_ENCRYPTION_KEY) {
        return Buffer.from(env.DATA_ENCRYPTION_KEY, "hex");
    }
    return createHash("sha256").update(`data-encryption:${env.JWT_REFRESH_SECRET}`).digest();
}

export function encryptString(plainText: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv(ALGORITHM, getKey(), iv);
    const encrypted = Buffer.concat([cipher.update(plainText, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();

    return [VERSION, iv.toString("base64"), tag.toString("base64"), encrypted.toString("base64")].join(":");
}

export function decryptString(payload: string): string {
    const [version, iv, tag, data] = payload.split(":");

    if (version !== VERSION || !iv || !tag || !data) {
        throw new Error("Unsupported encrypted payload.");
    }

    const decipher = createDecipheriv(ALGORITHM, getKey(), Buffer.from(iv, "base64"));
    decipher.setAuthTag(Buffer.from(tag, "base64"));

    return Buffer.concat([decipher.update(Buffer.from(data, "base64")), decipher.final()]).toString("utf8");
}

export function isEncrypted(value: string): boolean {
    return value.startsWith(`${VERSION}:`);
}

export function maskTail(value: string, visible = 4): string {
    return value.length <= visible ? value : `${"•".repeat(Math.min(value.length - visible, 8))}${value.slice(-visible)}`;
}
