import { env } from "@/lib/env";

export type BackendStatus = "online" | "degraded" | "offline";

const REQUEST_TIMEOUT_MS = 3_000;

export async function apiFetch(path: `/${string}`, init: RequestInit = {}): Promise<Response> {
  return fetch(`${env.apiUrl}${path}`, {
    ...init,
    credentials: "include",
    signal: init.signal ?? AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    headers: { Accept: "application/json", ...init.headers },
  });
}

export async function getBackendStatus(): Promise<BackendStatus> {
  try {
    // Cached briefly so page views don't hammer the API (all server renders share one rate-limit bucket).
    const res = await apiFetch("/health/ready", { next: { revalidate: 15 } });
    if (res.ok) return "online";
    return res.status === 503 ? "degraded" : "offline";
  } catch {
    return "offline";
  }
}
