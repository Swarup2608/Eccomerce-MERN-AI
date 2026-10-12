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
  mfaEnabled: boolean;
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

// Step 1: a correct password emails a one-time code and returns the challenge it belongs to.
export async function login(email: string, password: string): Promise<string> {
  const res = await apiFetch(`${BASE}/login`, { method: "POST", body: JSON.stringify({ email, password }) });
  return (await readJson<{ challengeId: string }>(res)).challengeId;
}

// Emails a fresh code for the same sign-in attempt (no password needed). Wrong guesses so far still count.
export async function resendLoginCode(challengeId: string): Promise<void> {
  await readJson<unknown>(await apiFetch(`${BASE}/login/resend`, { method: "POST", body: JSON.stringify({ challengeId }) }));
}

// Step 2: the emailed code starts the session.
export async function verifyLoginCode(challengeId: string, code: string): Promise<AdminUser> {
  const res = await apiFetch(`${BASE}/login/verify`, { method: "POST", body: JSON.stringify({ challengeId, code }) });
  return (await readJson<{ user: AdminUser }>(res)).user;
}

// Public and neutral: the same answer whether or not the email belongs to an admin.
export async function forgotPassword(email: string): Promise<void> {
  await readJson<unknown>(await apiFetch(`${BASE}/forgot-password`, { method: "POST", body: JSON.stringify({ email }) }));
}

// Also lifts a 24-hour block (too many wrong passwords or codes).
export async function resetPassword(token: string, password: string): Promise<void> {
  await readJson<void>(await apiFetch(`${BASE}/reset-password`, { method: "POST", body: JSON.stringify({ token, password }) }));
}

// Signs every other session out; this browser stays signed in.
export async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  await readJson<unknown>(await authFetch(`${BASE}/change-password`, { method: "POST", body: JSON.stringify({ currentPassword, newPassword }) }));
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
  if (error.status === 503) return "The service is temporarily unavailable. Please try again in a moment.";
  if (error.details?.length) return error.details.map((detail) => detail.message).join(". ");
  return error.message;
}
