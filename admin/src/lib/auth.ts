import { ApiError, apiFetch, readJson } from "@/lib/api";

export interface AdminUser {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  userName: string;
  phoneNumber?: string;
  role: "admin";
  emailVerified: boolean;
  phoneVerified: boolean;
}

const BASE = "/api/v1/admin/auth";

let refreshing: Promise<boolean> | null = null;

// Single-flight: concurrent 401s share one refresh, because a refresh token is single-use
// and a second parallel refresh would look like token reuse and end the session.
export function refreshSession(): Promise<boolean> {
  refreshing ??= apiFetch(`${BASE}/refresh`, { method: "POST" })
    .then((res) => res.ok)
    .catch(() => false)
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

// Calls an authenticated admin endpoint, transparently refreshing an expired access token once.
export async function authFetch(path: `/${string}`, init: RequestInit = {}): Promise<Response> {
  const res = await apiFetch(path, init);
  if (res.status !== 401 || !(await refreshSession())) return res;
  return apiFetch(path, init);
}

export async function login(email: string, password: string): Promise<AdminUser> {
  const res = await apiFetch(`${BASE}/login`, { method: "POST", body: JSON.stringify({ email, password }) });
  return (await readJson<{ user: AdminUser }>(res)).user;
}

export async function getCurrentAdmin(): Promise<AdminUser | null> {
  try {
    const res = await authFetch(`${BASE}/me`);
    if (res.status === 401 || res.status === 403) return null;
    return (await readJson<{ user: AdminUser }>(res)).user;
  } catch (error) {
    if (error instanceof ApiError && (error.status === 401 || error.status === 403)) return null;
    throw error;
  }
}

// `everywhere` revokes every session of this account (all devices); otherwise only this browser's session.
export async function logout(everywhere = false): Promise<void> {
  if (everywhere) {
    const res = await authFetch(`${BASE}/logout-all`, { method: "POST" });
    if (res.ok || res.status === 401) return;
    await readJson<void>(res);
  }
  await readJson<void>(await apiFetch(`${BASE}/logout`, { method: "POST" }));
}

export function errorMessage(error: unknown): string {
  if (!(error instanceof ApiError)) return "Something went wrong. Please check your connection and try again.";
  if (error.details?.length) return error.details.map((detail) => detail.message).join(". ");
  return error.message;
}
