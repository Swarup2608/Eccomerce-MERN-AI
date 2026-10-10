import { apiRequest, type ApiResponse } from "./client";

export type OnboardingStatus = "in_progress" | "submitted" | "approved" | "rejected";
export type OnboardingStep = "business_details" | "documents" | "bank_details" | "addresses" | "store_setup" | "review";
export type VendorStatus = "pending" | "active" | "suspended" | "rejected";
export type BusinessType = "individual" | "sole_proprietorship" | "partnership" | "private_limited" | "llp";
export type DocumentType = "government_id" | "business_registration" | "tax_document" | "address_proof";
export type DocumentMimeType = "application/pdf" | "image/jpeg" | "image/png" | "image/webp";
export type AddressType = "business" | "warehouse" | "return";

export interface Vendor {
    _id: string;
    businessName: string;
    businessType: BusinessType;
    status: VendorStatus;
    rejectionReason?: string;
    suspensionReason?: string;
}

export interface Application {
    _id: string;
    status: OnboardingStatus;
    currentStep: OnboardingStep;
    submittedAt?: string;
    reviewedAt?: string;
    rejectionReason?: string;
}

export interface VendorStore {
    _id: string;
    name: string;
    slug: string;
    description?: string;
    logoUrl?: string;
    bannerUrl?: string;
    isPublished: boolean;
}

export interface VendorAddress {
    _id: string;
    type: AddressType;
    recipientName: string;
    phone: string;
    addressLine1: string;
    addressLine2?: string;
    city: string;
    state: string;
    postalCode: string;
    country: string;
}

export interface VendorDocument {
    _id: string;
    type: DocumentType;
    originalFileName: string;
    mimeType: DocumentMimeType;
    status: "pending" | "verified" | "rejected";
    rejectionReason?: string;
    createdAt: string;
}

export interface BankAccount {
    _id: string;
    accountHolderName: string;
    accountNumberLast4: string;
    ifscCode: string;
    bankName: string;
    isVerified: boolean;
}

export interface Checklist {
    businessDetails: boolean;
    documents: boolean;
    bankAccount: boolean;
    businessAddress: boolean;
    store: boolean;
}

export interface Onboarding {
    vendor: Vendor;
    application: Application | null;
    store: VendorStore | null;
    addresses: VendorAddress[];
    documents: VendorDocument[];
    bankAccount: BankAccount | null;
    checklist: Checklist;
}

export type AddressInput = Omit<VendorAddress, "_id">;

export interface BusinessInput {
    businessName: string;
    businessType: BusinessType;
}

export interface BankAccountInput {
    accountHolderName: string;
    accountNumber: string;
    ifscCode: string;
    bankName: string;
}

export interface StoreInput {
    name: string;
    slug: string;
    description?: string;
    logoUrl?: string;
    bannerUrl?: string;
}

export interface DocumentInput {
    type: DocumentType;
    storageKey: string;
    originalFileName: string;
    mimeType: DocumentMimeType;
}

const BASE = "/vendor-onboarding";

export function getMyOnboarding() {
    return apiRequest<ApiResponse<Onboarding>>(`${BASE}/me`);
}

export function startOnboarding(input: BusinessInput) {
    return apiRequest<ApiResponse<{ vendor: Vendor; application: Application }>>(`${BASE}/start`, { method: "POST", body: JSON.stringify(input) });
}

export function updateBusiness(input: BusinessInput) {
    return apiRequest<ApiResponse<{ vendor: Vendor }>>(`${BASE}/business`, { method: "PATCH", body: JSON.stringify(input) });
}

export function addDocument(input: DocumentInput) {
    return apiRequest<ApiResponse<{ document: VendorDocument }>>(`${BASE}/documents`, { method: "POST", body: JSON.stringify(input) });
}

export function deleteDocument(documentId: string) {
    return apiRequest<{ success: true }>(`${BASE}/documents/${documentId}`, { method: "DELETE" });
}

export function saveBankAccount(input: BankAccountInput) {
    return apiRequest<ApiResponse<{ bankAccount: BankAccount }>>(`${BASE}/bank-account`, { method: "POST", body: JSON.stringify(input) });
}

export function addAddress(input: AddressInput) {
    return apiRequest<ApiResponse<{ address: VendorAddress }>>(`${BASE}/addresses`, { method: "POST", body: JSON.stringify(input) });
}

export function deleteAddress(addressId: string) {
    return apiRequest<{ success: true }>(`${BASE}/addresses/${addressId}`, { method: "DELETE" });
}

export function saveStore(input: StoreInput) {
    return apiRequest<ApiResponse<{ store: VendorStore }>>(`${BASE}/store`, { method: "PUT", body: JSON.stringify(input) });
}

export function submitOnboarding() {
    return apiRequest<ApiResponse<{ application: Application }>>(`${BASE}/submit`, { method: "POST" });
}

export const BUSINESS_TYPE_LABELS: Record<BusinessType, string> = {
    individual: "Individual",
    sole_proprietorship: "Sole proprietorship",
    partnership: "Partnership",
    private_limited: "Private limited",
    llp: "LLP",
};

export const DOCUMENT_TYPE_LABELS: Record<DocumentType, string> = {
    government_id: "Government ID",
    business_registration: "Business registration",
    tax_document: "Tax document (GST/PAN)",
    address_proof: "Address proof",
};

export const ADDRESS_TYPE_LABELS: Record<AddressType, string> = {
    business: "Business",
    warehouse: "Warehouse / pickup",
    return: "Returns",
};
