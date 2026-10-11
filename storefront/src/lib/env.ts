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

export const env = Object.freeze({ apiUrl: readApiUrl() });
