import { apiRequest, type ApiResponse } from "./client";

export type UserRole = "user" | "vendor" | "admin" | "super_admin" | "procurement_officer" | "vendor_onboarding_reviewer";

export interface AuthUser {
    _id: string;
    firstName: string;
    lastName: string;
    email: string;
    userName: string;
    role: UserRole;
    status: string;
}

export const ADMIN_ROLES: UserRole[] = ["admin", "super_admin"];

export function login(identifier: string, password: string) {
    return apiRequest<ApiResponse<{ user: AuthUser }>>("/auth/login", { method: "POST", body: JSON.stringify({ identifier, password }) });
}

export function superAdminLogin(email: string, password: string) {
    return apiRequest<ApiResponse<{ user: AuthUser & { id?: string } }>>("/auth/super-admin/login", { method: "POST", body: JSON.stringify({ email, password }) });
}

export function logout() {
    return apiRequest<{ success: true }>("/auth/logout", { method: "POST" });
}

export function getCurrentUser() {
    return apiRequest<ApiResponse<{ user: AuthUser }>>("/auth/me");
}
