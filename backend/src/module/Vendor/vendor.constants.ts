// Vendor account status, kept separate from onboarding status so an approved
// vendor can still be suspended. Only ACTIVE vendors may sell.
export const VENDOR_STATUSES = {
    PENDING: "pending",
    ACTIVE: "active",
    SUSPENDED: "suspended",
    REJECTED: "rejected",
} as const;

export type VendorStatus = (typeof VENDOR_STATUSES)[keyof typeof VENDOR_STATUSES];

export const ONBOARDING_STATUSES = {
    IN_PROGRESS: "in_progress",
    SUBMITTED: "submitted",
    APPROVED: "approved",
    REJECTED: "rejected",
} as const;

export type OnboardingStatus = (typeof ONBOARDING_STATUSES)[keyof typeof ONBOARDING_STATUSES];

export const ONBOARDING_STEPS = {
    BUSINESS_DETAILS: "business_details",
    DOCUMENTS: "documents",
    BANK_DETAILS: "bank_details",
    ADDRESSES: "addresses",
    STORE_SETUP: "store_setup",
    REVIEW: "review",
} as const;

export type OnboardingStep = (typeof ONBOARDING_STEPS)[keyof typeof ONBOARDING_STEPS];

export const VENDOR_DOCUMENT_TYPES = {
    GOVERNMENT_ID: "government_id",
    BUSINESS_REGISTRATION: "business_registration",
    TAX_DOCUMENT: "tax_document",
    ADDRESS_PROOF: "address_proof",
} as const;

export type VendorDocumentType = (typeof VENDOR_DOCUMENT_TYPES)[keyof typeof VENDOR_DOCUMENT_TYPES];

export const VENDOR_DOCUMENT_STATUSES = {
    PENDING: "pending",
    VERIFIED: "verified",
    REJECTED: "rejected",
} as const;

export type VendorDocumentStatus = (typeof VENDOR_DOCUMENT_STATUSES)[keyof typeof VENDOR_DOCUMENT_STATUSES];

export const VENDOR_ADDRESS_TYPES = {
    BUSINESS: "business",
    WAREHOUSE: "warehouse",
    RETURN: "return",
} as const;

export type VendorAddressType = (typeof VENDOR_ADDRESS_TYPES)[keyof typeof VENDOR_ADDRESS_TYPES];

export const VENDOR_BUSINESS_TYPES = {
    INDIVIDUAL: "individual",
    SOLE_PROPRIETORSHIP: "sole_proprietorship",
    PARTNERSHIP: "partnership",
    PRIVATE_LIMITED: "private_limited",
    LLP: "llp",
} as const;

export type VendorBusinessType = (typeof VENDOR_BUSINESS_TYPES)[keyof typeof VENDOR_BUSINESS_TYPES];

export const DOCUMENT_MIME_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp"] as const;
