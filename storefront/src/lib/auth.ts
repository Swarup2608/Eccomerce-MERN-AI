import { ApiError, apiFetch, readJson } from "@/lib/api";

export interface User {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  userName: string;
  phoneNumber?: string;
  role: "user";
  emailVerified: boolean;
  phoneVerified: boolean;
  mfaEnabled: boolean;
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

// Resolves to the signed-in user, or to a challenge id when the account also needs the code that was just emailed.
export async function login(identifier: string, password: string): Promise<User | { challengeId: string }> {
  const res = await apiFetch(`${BASE}/login`, { method: "POST", body: JSON.stringify({ identifier, password }) });
  const body = await readJson<{ user?: User; challengeId?: string }>(res);
  if (body.challengeId) return { challengeId: body.challengeId };
  if (!body.user) throw new Error("Unexpected response");
  return body.user;
}

export async function verifyLoginCode(challengeId: string, code: string): Promise<User> {
  const res = await apiFetch(`${BASE}/login/verify`, { method: "POST", body: JSON.stringify({ challengeId, code }) });
  return (await readJson<{ user: User }>(res)).user;
}

// Emails a fresh code for the same sign-in attempt (no password needed). Wrong guesses so far still count.
export async function resendLoginCode(challengeId: string): Promise<void> {
  await readJson<unknown>(await apiFetch(`${BASE}/login/resend`, { method: "POST", body: JSON.stringify({ challengeId }) }));
}

// Turns the emailed sign-in code on or off; needs the current password.
export async function setTwoStep(enabled: boolean, currentPassword: string): Promise<User> {
  return (await readJson<{ user: User }>(await authFetch(`${BASE}/mfa`, { method: "POST", body: JSON.stringify({ enabled, currentPassword }) }))).user;
}

// Creating an account never signs you in: a verification link is emailed first.
export async function register(input: RegisterInput): Promise<void> {
  await readJson<unknown>(await apiFetch(`${BASE}/register`, { method: "POST", body: JSON.stringify(input) }));
}

export async function verifyEmail(token: string): Promise<void> {
  await readJson<void>(await apiFetch(`${BASE}/verify-email`, { method: "POST", body: JSON.stringify({ token }) }));
}

// Public and neutral: the same answer whether or not a mail was sent. Asking too often blocks the account.
export async function resendVerification(email: string): Promise<void> {
  await readJson<unknown>(await apiFetch(`${BASE}/resend-verification`, { method: "POST", body: JSON.stringify({ email }) }));
}

export async function forgotPassword(email: string): Promise<void> {
  await readJson<unknown>(await apiFetch(`${BASE}/forgot-password`, { method: "POST", body: JSON.stringify({ email }) }));
}

export async function resetPassword(token: string, password: string): Promise<void> {
  await readJson<void>(await apiFetch(`${BASE}/reset-password`, { method: "POST", body: JSON.stringify({ token, password }) }));
}

// Signs every other device out; this browser stays signed in.
export async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  await readJson<unknown>(await authFetch(`${BASE}/change-password`, { method: "POST", body: JSON.stringify({ currentPassword, newPassword }) }));
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
  if (error.status === 503) return "The service is temporarily unavailable. Please try again in a moment.";
  if (error.details?.length) return error.details.map((detail) => detail.message).join(". ");
  return error.message;
}
