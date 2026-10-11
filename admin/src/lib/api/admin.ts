import { apiRequest, type ApiResponse } from "./client";
import type { UserRole } from "./auth";

export interface Pagination {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
}

function query(params: Record<string, string | number | undefined>): string {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== "") search.set(key, String(value));
    }
    const text = search.toString();
    return text ? `?${text}` : "";
}

const json = (method: string, body?: unknown): RequestInit => ({ method, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });

// Dashboard

export interface DashboardStats {
    users: { total: number; active: number; newLast30Days: number; byRole: Record<string, number> };
    vendors: { byStatus: Record<string, number>; pendingApplications: number };
    catalog: { productsByStatus: Record<string, number>; activeCategories: number };
    recentApplications: { _id: string; submittedAt?: string; vendorId: { _id: string; businessName: string; businessType: string } | null }[];
}

export const getDashboard = () => apiRequest<ApiResponse<DashboardStats>>("/admin/dashboard");

// Users

export interface AdminUser {
    _id: string;
    firstName: string;
    lastName: string;
    email: string;
    userName: string;
    phoneNumber?: string;
    role: UserRole;
    status: "active" | "inactive" | "suspended" | "deleted";
    emailVerified: boolean;
    lastLoginAt?: string | null;
    createdAt: string;
}

export const listUsers = (params: { search?: string; role?: string; status?: string; page?: number }) =>
    apiRequest<ApiResponse<{ users: AdminUser[]; pagination: Pagination }>>(`/admin/users${query(params)}`);

export const updateUserStatus = (userId: string, status: "active" | "inactive" | "suspended") =>
    apiRequest<ApiResponse<{ user: AdminUser }>>(`/admin/users/${userId}/status`, json("PATCH", { status }));

export const updateUserRole = (userId: string, role: UserRole) => apiRequest<ApiResponse<{ user: AdminUser }>>(`/admin/users/${userId}/role`, json("PATCH", { role }));

// Vendors and applications

export type VendorStatus = "pending" | "active" | "suspended" | "rejected";
export type ApplicationStatus = "in_progress" | "submitted" | "approved" | "rejected";

export interface Vendor {
    _id: string;
    userId: string;
    businessName: string;
    businessType: string;
    status: VendorStatus;
    rejectionReason?: string;
    suspensionReason?: string;
    commissionPercent?: number;
    effectiveCommissionPercent?: number;
    createdAt: string;
    store?: { name: string; slug: string; isPublished: boolean } | null;
}

export interface Application {
    _id: string;
    status: ApplicationStatus;
    currentStep: string;
    submittedAt?: string;
    reviewedAt?: string;
    reviewedBy?: string;
    rejectionReason?: string;
    updatedAt: string;
    vendorId: { _id: string; businessName: string; businessType: string; status: VendorStatus } | null;
}

export interface VendorDocument {
    _id: string;
    type: string;
    originalFileName: string;
    mimeType: string;
    status: "pending" | "verified" | "rejected";
    rejectionReason?: string;
    createdAt: string;
}

export interface VendorAddress {
    _id: string;
    type: string;
    recipientName: string;
    phone: string;
    addressLine1: string;
    addressLine2?: string;
    city: string;
    state: string;
    postalCode: string;
    country: string;
}

export interface VendorDetail {
    vendor: Vendor;
    owner: AdminUser | null;
    application: Omit<Application, "vendorId"> | null;
    store: { name: string; slug: string; description?: string; logoUrl?: string; isPublished: boolean } | null;
    addresses: VendorAddress[];
    documents: VendorDocument[];
    bankAccount: { accountHolderName: string; accountNumberLast4: string; ifscCode: string; bankName: string; isVerified: boolean } | null;
    checklist: Record<string, boolean>;
}

const VENDOR_BASE = "/vendor-onboarding/admin";

export const listApplications = (params: { status?: ApplicationStatus; page?: number }) =>
    apiRequest<ApiResponse<{ applications: Application[]; pagination: Pagination }>>(`${VENDOR_BASE}/applications${query(params)}`);

export const reviewApplication = (vendorId: string, decision: "approve" | "reject", rejectionReason?: string) =>
    apiRequest<ApiResponse<unknown>>(`${VENDOR_BASE}/applications/${vendorId}/review`, json("PATCH", { decision, ...(rejectionReason ? { rejectionReason } : {}) }));

export const listVendors = (params: { status?: VendorStatus; search?: string; page?: number }) =>
    apiRequest<ApiResponse<{ vendors: Vendor[]; pagination: Pagination }>>(`${VENDOR_BASE}/vendors${query(params)}`);

export const getVendor = (vendorId: string) => apiRequest<ApiResponse<VendorDetail>>(`${VENDOR_BASE}/vendors/${vendorId}`);

export const changeVendorStatus = (vendorId: string, action: "suspend" | "reactivate", reason?: string) =>
    apiRequest<ApiResponse<{ vendor: Vendor }>>(`${VENDOR_BASE}/vendors/${vendorId}/status`, json("PATCH", { action, ...(reason ? { reason } : {}) }));

export const setVendorCommission = (vendorId: string, commissionPercent: number | null) =>
    apiRequest<ApiResponse<{ vendor: Vendor }>>(`${VENDOR_BASE}/vendors/${vendorId}/commission`, json("PATCH", { commissionPercent }));

export const getDocumentLink = (vendorId: string, documentId: string) =>
    apiRequest<ApiResponse<{ url: string; fileName: string; expiresAt: string }>>(`${VENDOR_BASE}/vendors/${vendorId}/documents/${documentId}/download`);

export const reviewDocument = (vendorId: string, documentId: string, status: "verified" | "rejected", rejectionReason?: string) =>
    apiRequest<ApiResponse<{ document: VendorDocument }>>(`${VENDOR_BASE}/vendors/${vendorId}/documents/${documentId}`, json("PATCH", { status, ...(rejectionReason ? { rejectionReason } : {}) }));

// Catalog: categories

export interface Category {
    _id: string;
    name: string;
    slug: string;
    description?: string;
    image?: string;
    isActive: boolean;
    sortOrder: number;
}

export type CategoryInput = Partial<Omit<Category, "_id">> & { name: string; slug: string };

export const listCategories = () => apiRequest<ApiResponse<{ categories: Category[] }>>("/categories?includeInactive=true");
export const createCategory = (input: CategoryInput) => apiRequest<ApiResponse<{ category: Category }>>("/categories", json("POST", input));
export const updateCategory = (categoryId: string, input: Partial<CategoryInput>) => apiRequest<ApiResponse<{ category: Category }>>(`/categories/${categoryId}`, json("PATCH", input));
export const deleteCategory = (categoryId: string) => apiRequest<{ success: true }>(`/categories/${categoryId}`, json("DELETE"));

// Catalog: products

export type ProductStatus = "draft" | "active" | "archived";

export interface ProductImage {
    url: string;
    alt?: string;
    isPrimary: boolean;
    sortOrder: number;
}

export interface Product {
    _id: string;
    name: string;
    slug: string;
    description: string;
    shortDescription?: string;
    brand?: string;
    categoryId: { _id: string; name: string; slug: string } | string;
    images: ProductImage[];
    attributes: Record<string, string>;
    status: ProductStatus;
    variantCount?: number;
    createdAt: string;
}

export interface ProductVariant {
    _id: string;
    attributes: Record<string, string>;
    variantKey: string;
    isDefault: boolean;
    offerCount: number;
}

export interface ProductInput {
    name: string;
    slug: string;
    description: string;
    shortDescription?: string;
    brand?: string;
    categoryId: string;
    images: ProductImage[];
    attributes: Record<string, string>;
    status: ProductStatus;
    variants?: { attributes: Record<string, string> }[];
}

export const listProducts = (params: { search?: string; status?: string; categoryId?: string; page?: number }) =>
    apiRequest<ApiResponse<{ products: Product[]; pagination: Pagination }>>(`/admin/products${query(params)}`);

export const getProduct = (productId: string) => apiRequest<ApiResponse<{ product: Product; variants: ProductVariant[] }>>(`/admin/products/${productId}`);
export const createProduct = (input: ProductInput) => apiRequest<ApiResponse<{ product: Product }>>("/products", json("POST", input));
export const updateProduct = (productId: string, input: Partial<ProductInput>) => apiRequest<ApiResponse<{ product: Product }>>(`/admin/products/${productId}`, json("PATCH", input));

export const createVariant = (productId: string, attributes: Record<string, string>, isDefault = false) =>
    apiRequest<ApiResponse<{ variant: ProductVariant }>>(`/admin/products/${productId}/variants`, json("POST", { attributes, isDefault }));

export const makeVariantDefault = (productId: string, variantId: string) =>
    apiRequest<ApiResponse<{ variant: ProductVariant }>>(`/admin/products/${productId}/variants/${variantId}`, json("PATCH", { isDefault: true }));

export const deleteVariant = (productId: string, variantId: string) => apiRequest<{ success: true }>(`/admin/products/${productId}/variants/${variantId}`, json("DELETE"));

// Uploads

type UploadSignature =
    | { provider: "none"; folder: string; type: string }
    | { provider: "cloudinary"; apiKey: string; uploadUrl: string; timestamp: number; signature: string; folder: string; type: string };

// Returns the public image URL, or null when uploads are not configured (dev only).
export async function uploadProductImage(file: File): Promise<string | null> {
    const { data: signature } = await apiRequest<ApiResponse<UploadSignature>>("/uploads/signature", json("POST", { purpose: "product_image" }));

    if (signature.provider === "none") {
        return null;
    }

    const form = new FormData();
    form.append("file", file);
    form.append("api_key", signature.apiKey);
    form.append("timestamp", String(signature.timestamp));
    form.append("signature", signature.signature);
    form.append("folder", signature.folder);

    const response = await fetch(signature.uploadUrl, { method: "POST", body: form });
    const body = (await response.json().catch(() => null)) as { secure_url?: string; error?: { message?: string } } | null;

    if (!response.ok || !body?.secure_url) {
        throw new Error(body?.error?.message ?? "Image upload failed.");
    }

    return body.secure_url;
}
