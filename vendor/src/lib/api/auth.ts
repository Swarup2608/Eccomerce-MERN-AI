import { apiRequest, type ApiResponse } from "./client";

export type UserRole = "user" | "vendor" | "admin" | "super_admin" | "procurement_officer" | "vendor_onboarding_reviewer";

export interface AuthUser {
    _id: string;
    firstName: string;
    lastName: string;
    email: string;
    userName: string;
    phoneNumber?: string;
    role: UserRole;
    status: string;
    emailVerified: boolean;
    phoneVerified: boolean;
}

export interface LoginInput {
    identifier: string;
    password: string;
}

export function login(input: LoginInput) {
    return apiRequest<ApiResponse<{ user: AuthUser }>>("/auth/login", { method: "POST", body: JSON.stringify(input) });
}

export function logout() {
    return apiRequest<{ success: true; message: string }>("/auth/logout", { method: "POST" });
}

export function getCurrentUser() {
    return apiRequest<ApiResponse<{ user: AuthUser }>>("/auth/me");
}
