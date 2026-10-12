const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

// NEXT_PUBLIC_* must be read with a literal property access so Next can inline it at build time.
function readApiUrl(): string {
  const raw = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
  if (!URL.canParse(raw)) throw new Error("NEXT_PUBLIC_API_URL is not a valid URL");

  const url = new URL(raw);
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("NEXT_PUBLIC_API_URL must be http(s)");
  if (process.env.NODE_ENV === "production" && url.protocol !== "https:" && !LOCAL_HOSTS.has(url.hostname)) {
    throw new Error("NEXT_PUBLIC_API_URL must use https in production");
  }
  return url.origin;
}

// Optional origins for product images: where they are shown from (the R2 public bucket or its custom domain) and where
// the browser uploads them to (the R2 S3 endpoint). Both are added to the Content-Security-Policy.
function readOrigin(raw: string | undefined, name: string): string | null {
  if (!raw) return null;
  if (!URL.canParse(raw) || new URL(raw).protocol !== "https:") throw new Error(`${name} must be an https URL`);
  return new URL(raw).origin;
}

export const env = Object.freeze({
  apiUrl: readApiUrl(),
  imageOrigin: readOrigin(process.env.NEXT_PUBLIC_IMAGE_ORIGIN, "NEXT_PUBLIC_IMAGE_ORIGIN"),
  // Defaults to any R2 account endpoint; set it to https://<account-id>.r2.cloudflarestorage.com to pin it.
  uploadOrigin: readOrigin(process.env.NEXT_PUBLIC_UPLOAD_ORIGIN, "NEXT_PUBLIC_UPLOAD_ORIGIN") ?? "https://*.r2.cloudflarestorage.com",
});
