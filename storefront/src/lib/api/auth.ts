import { apiRequest } from "./client";

export type UserRole = "user" | "vendor" | "admin" | "super_admin";

export type UserStatus = "active" | "inactive" | "suspended" | "deleted";

export interface AuthUser {
  _id: string;
  firstName: string;
  lastName: string;
  email: string;
  userName: string;
  phoneNumber?: string;
  role: UserRole;
  status: UserStatus;
  emailVerified: boolean;
  phoneVerified: boolean;
}

export interface AuthResponse {
  success: true;
  message: string;
  data: {
    user: AuthUser;
  };
}

export interface ApiSuccessResponse {
  success: true;
  message: string;
}

export interface RegisterInput {
  firstName: string;
  lastName: string;
  email: string;
  userName: string;
  password: string;
  phoneNumber?: string;
}

export interface LoginInput {
  identifier: string;
  password: string;
}

export function register(input: RegisterInput): Promise<AuthResponse> {
  return apiRequest<AuthResponse>("/auth/register", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function login(input: LoginInput): Promise<AuthResponse> {
  return apiRequest<AuthResponse>("/auth/login", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function refreshSession(): Promise<ApiSuccessResponse> {
  return apiRequest<ApiSuccessResponse>("/auth/refresh", {
    method: "POST",
  });
}

export function logout(): Promise<ApiSuccessResponse> {
  return apiRequest<ApiSuccessResponse>("/auth/logout", {
    method: "POST",
  });
}

export function verifyEmail(token: string): Promise<ApiSuccessResponse> {
  return apiRequest<ApiSuccessResponse>("/auth/verify-email", {
    method: "POST",
    body: JSON.stringify({ token }),
  });
}