import { env } from "@/lib/env";

export type BackendStatus = "online" | "degraded" | "offline";

const REQUEST_TIMEOUT_MS = 10_000;

export class ApiError extends Error {
  constructor(readonly status: number, readonly code: string, message: string, readonly details?: { path: string; message: string }[]) {
    super(message);
    this.name = "ApiError";
  }
}

// Cookies (the auth tokens) are HttpOnly and set by the API; `credentials: "include"` is what sends them back.
export async function apiFetch(path: `/${string}`, init: RequestInit = {}): Promise<Response> {
  return fetch(`${env.apiUrl}${path}`, {
    ...init,
    credentials: "include",
    signal: init.signal ?? AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    headers: { Accept: "application/json", ...(init.body ? { "Content-Type": "application/json" } : {}), ...init.headers },
  });
}

export async function readJson<T>(res: Response): Promise<T> {
  if (res.ok) return (res.status === 204 ? undefined : await res.json()) as T;
  const body = (await res.json().catch(() => null)) as { error?: { code?: string; message?: string; details?: { path: string; message: string }[] } } | null;
  throw new ApiError(res.status, body?.error?.code ?? "UNKNOWN", body?.error?.message ?? "Request failed", body?.error?.details);
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
