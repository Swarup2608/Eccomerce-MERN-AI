import { randomUUID } from "node:crypto";
import { trusted } from "mongoose";
import { z } from "zod";
import { HttpError } from "../../lib/http-error.js";
import type { Logger } from "../../lib/logger.js";
import type { ObjectStorage, PresignedUpload } from "../../lib/storage.js";
import { Upload } from "./upload.model.js";

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

const IMAGE_TYPES = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/avif": "avif",
} as const;

type ImageType = keyof typeof IMAGE_TYPES;

export const createUploadSchema = z
  .object({
    contentType: z.enum(Object.keys(IMAGE_TYPES) as [ImageType, ...ImageType[]], { message: "Use a JPEG, PNG, WebP or AVIF image" }),
    size: z.number().int().min(1).max(MAX_IMAGE_BYTES, "Images must be 5 MB or smaller"),
  })
  .strict();

export type CreateUploadInput = z.infer<typeof createUploadSchema>;

export const IMAGE_KEY_PATTERN = /^products\/[0-9a-f-]{36}\.(jpg|png|webp|avif)$/;

const ascii = (bytes: Uint8Array, start: number, end: number): string => String.fromCharCode(...bytes.slice(start, end));

// The declared Content-Type is only what the browser claimed; the first bytes say what the file really is.
export function matchesSignature(contentType: string, bytes: Uint8Array): boolean {
  switch (contentType) {
    case "image/jpeg":
      return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
    case "image/png":
      return [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((byte, index) => bytes[index] === byte);
    case "image/webp":
      return ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 12) === "WEBP";
    case "image/avif":
      return ascii(bytes, 4, 8) === "ftyp" && ["avif", "avis"].includes(ascii(bytes, 8, 12));
    default:
      return false;
  }
}

export interface ImageRef {
  key: string;
  url: string;
}

export interface UploadTicket extends PresignedUpload {
  key: string;
  publicUrl: string;
}

export const storageUnavailable = (): HttpError => new HttpError(503, "FEATURE_UNAVAILABLE", "Image uploads are not configured");

export class UploadService {
  constructor(
    private readonly storage: ObjectStorage | undefined,
    private readonly logger: Logger,
  ) {}

  get enabled(): boolean {
    return this.storage !== undefined;
  }

  publicUrl(key: string): string {
    return this.storage ? this.storage.publicUrl(key) : key;
  }

  async createUpload(input: CreateUploadInput, adminId: string): Promise<UploadTicket> {
    if (!this.storage) throw storageUnavailable();
    const key = `products/${randomUUID()}.${IMAGE_TYPES[input.contentType]}`;
    await Upload.create({ key, contentType: input.contentType, size: input.size, uploadedBy: adminId });
    const ticket = await this.storage.presignPut(key, input.contentType, input.size);
    return { ...ticket, key, publicUrl: this.storage.publicUrl(key) };
  }

  // Claims newly referenced image keys for a product: each must be a pending upload that really landed in the bucket,
  // with the declared size and a matching file signature. Keys the product already had are passed through untouched.
  async attach(keys: readonly string[], alreadyAttached: ReadonlySet<string> = new Set()): Promise<ImageRef[]> {
    const fresh = keys.filter((key) => !alreadyAttached.has(key));
    if (fresh.length > 0) {
      if (!this.storage) throw storageUnavailable();
      const uploads = await Upload.find({ key: trusted({ $in: fresh }), status: "pending" }).lean();
      const byKey = new Map(uploads.map((upload) => [upload.key, upload]));
      for (const key of fresh) {
        const upload = byKey.get(key);
        if (!upload) throw invalidImage(key, "was not uploaded or is already used");
        const stored = await this.storage.head(key);
        if (!stored) throw invalidImage(key, "has not finished uploading");
        if (stored.size !== upload.size || stored.size > MAX_IMAGE_BYTES) throw invalidImage(key, "does not match the declared size");
        if (!matchesSignature(upload.contentType, await this.storage.readPrefix(key, 16))) throw invalidImage(key, "is not a valid image file");
      }
      await Upload.updateMany({ key: trusted({ $in: fresh }) }, { $set: { status: "attached" } });
    }
    return keys.map((key) => ({ key, url: this.publicUrl(key) }));
  }

  // Undoes `attach` when the product save that claimed the images failed, so the same uploads can be used on a retry.
  async release(keys: readonly string[]): Promise<void> {
    if (keys.length) await Upload.updateMany({ key: trusted({ $in: [...keys] }) }, { $set: { status: "pending" } });
  }

  // Best effort: a failed delete leaves an orphan in the bucket, which is not worth failing the admin's request for.
  async remove(keys: readonly string[]): Promise<void> {
    if (keys.length === 0) return;
    await Upload.deleteMany({ key: trusted({ $in: [...keys] }) });
    if (!this.storage) return;
    const storage = this.storage;
    await Promise.all(keys.map((key) => storage.delete(key).catch((error: unknown) => this.logger.error("Failed to delete image", { key, error }))));
  }

  // Pending uploads older than `olderThanMs` were never attached to a product.
  async cleanupPending(olderThanMs: number): Promise<number> {
    const stale = await Upload.find({ status: "pending", createdAt: trusted({ $lt: new Date(Date.now() - olderThanMs) }) }).limit(1000).lean();
    await this.remove(stale.map((upload) => upload.key));
    return stale.length;
  }
}

const invalidImage = (key: string, reason: string): HttpError => new HttpError(422, "INVALID_IMAGE", `Image ${key} ${reason}`, [{ path: "images", message: `Image ${reason}` }]);
