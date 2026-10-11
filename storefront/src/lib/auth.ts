import { ApiError, apiFetch, readJson } from "@/lib/api";

export interface User {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  userName: string;
  phoneNumber?: string;
  role: "user" | "admin";
  emailVerified: boolean;
  phoneVerified: boolean;
}

export interface RegisterInput {
  firstName: string;
  lastName: string;
  email: string;
  userName: string;
  password: string;
  phoneNumber?: string;
}

const BASE = "/api/v1/auth";

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

// Calls an authenticated endpoint, transparently refreshing an expired access token once.
export async function authFetch(path: `/${string}`, init: RequestInit = {}): Promise<Response> {
  const res = await apiFetch(path, init);
  if (res.status !== 401 || !(await refreshSession())) return res;
  return apiFetch(path, init);
}

export async function login(identifier: string, password: string): Promise<User> {
  const res = await apiFetch(`${BASE}/login`, { method: "POST", body: JSON.stringify({ identifier, password }) });
  return (await readJson<{ user: User }>(res)).user;
}

export async function register(input: RegisterInput): Promise<User> {
  const res = await apiFetch(`${BASE}/register`, { method: "POST", body: JSON.stringify(input) });
  return (await readJson<{ user: User }>(res)).user;
}

export async function getCurrentUser(): Promise<User | null> {
  try {
    const res = await authFetch(`${BASE}/me`);
    if (res.status === 401) return null;
    return (await readJson<{ user: User }>(res)).user;
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) return null;
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
