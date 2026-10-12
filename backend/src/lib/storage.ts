import { DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { R2Config } from "../config/env.js";

export interface PresignedUpload {
  uploadUrl: string;
  // Headers the browser must send with the PUT exactly as signed.
  headers: Record<string, string>;
  expiresInSec: number;
}

export interface StoredObject {
  size: number;
  contentType: string | undefined;
}

export interface ObjectStorage {
  publicUrl(key: string): string;
  presignPut(key: string, contentType: string, size: number): Promise<PresignedUpload>;
  head(key: string): Promise<StoredObject | null>;
  // The first `bytes` bytes of the object, used to check the file signature of an upload.
  readPrefix(key: string, bytes: number): Promise<Uint8Array>;
  delete(key: string): Promise<void>;
}

const PRESIGN_TTL_SEC = 5 * 60;

const isNotFound = (error: unknown): boolean =>
  typeof error === "object" && error !== null && (("name" in error && (error.name === "NotFound" || error.name === "NoSuchKey")) || ("$metadata" in error && (error.$metadata as { httpStatusCode?: number }).httpStatusCode === 404));

// Cloudflare R2 through its S3-compatible API. Browsers upload straight to the bucket with a presigned PUT, so image
// bytes never pass through the API. The bucket needs a CORS rule allowing PUT from the admin origin.
export class R2Storage implements ObjectStorage {
  private readonly client: S3Client;

  constructor(private readonly config: R2Config) {
    this.client = new S3Client({
      region: "auto",
      endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
      // R2 does not support the SDK's default CRC checksums on presigned PUTs.
      requestChecksumCalculation: "WHEN_REQUIRED",
      responseChecksumValidation: "WHEN_REQUIRED",
    });
  }

  publicUrl(key: string): string {
    return `${this.config.publicUrl}/${key}`;
  }

  async presignPut(key: string, contentType: string, size: number): Promise<PresignedUpload> {
    // Content-Type and Content-Length are part of the signature, so the browser cannot swap in a different file type or size.
    const command = new PutObjectCommand({ Bucket: this.config.bucket, Key: key, ContentType: contentType, ContentLength: size, CacheControl: "public, max-age=31536000, immutable" });
    const uploadUrl = await getSignedUrl(this.client, command, { expiresIn: PRESIGN_TTL_SEC, signableHeaders: new Set(["content-type", "content-length"]) });
    return { uploadUrl, headers: { "Content-Type": contentType }, expiresInSec: PRESIGN_TTL_SEC };
  }

  async head(key: string): Promise<StoredObject | null> {
    try {
      const result = await this.client.send(new HeadObjectCommand({ Bucket: this.config.bucket, Key: key }));
      return { size: result.ContentLength ?? 0, contentType: result.ContentType };
    } catch (error) {
      if (isNotFound(error)) return null;
      throw error;
    }
  }

  async readPrefix(key: string, bytes: number): Promise<Uint8Array> {
    const result = await this.client.send(new GetObjectCommand({ Bucket: this.config.bucket, Key: key, Range: `bytes=0-${bytes - 1}` }));
    return result.Body ? await result.Body.transformToByteArray() : new Uint8Array();
  }

  async delete(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.config.bucket, Key: key }));
  }
}

// Tests and local development without R2: "uploads" are written with `put`.
export class MemoryStorage implements ObjectStorage {
  readonly objects = new Map<string, { body: Uint8Array; contentType: string }>();

  publicUrl(key: string): string {
    return `https://images.test/${key}`;
  }

  presignPut(key: string, contentType: string): Promise<PresignedUpload> {
    return Promise.resolve({ uploadUrl: `https://upload.test/${key}`, headers: { "Content-Type": contentType }, expiresInSec: PRESIGN_TTL_SEC });
  }

  put(key: string, body: Uint8Array, contentType: string): void {
    this.objects.set(key, { body, contentType });
  }

  head(key: string): Promise<StoredObject | null> {
    const object = this.objects.get(key);
    return Promise.resolve(object ? { size: object.body.byteLength, contentType: object.contentType } : null);
  }

  readPrefix(key: string, bytes: number): Promise<Uint8Array> {
    return Promise.resolve(this.objects.get(key)?.body.slice(0, bytes) ?? new Uint8Array());
  }

  delete(key: string): Promise<void> {
    this.objects.delete(key);
    return Promise.resolve();
  }
}
