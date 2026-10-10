import { z } from "zod";
import { DOCUMENT_MIME_TYPES, VENDOR_ADDRESS_TYPES, VENDOR_BUSINESS_TYPES, VENDOR_DOCUMENT_TYPES } from "./vendor.constants.js";

export const vendorBusinessSchema = z.object({
    businessName: z.string().trim().min(2).max(150),
    businessType: z.enum(VENDOR_BUSINESS_TYPES),
});

export type VendorBusinessInput = z.infer<typeof vendorBusinessSchema>;

export const vendorDocumentSchema = z.object({
    type: z.enum(VENDOR_DOCUMENT_TYPES),
    storageKey: z.string().trim().min(1).max(500),
    originalFileName: z.string().trim().min(1).max(255),
    mimeType: z.enum(DOCUMENT_MIME_TYPES),
});

export type VendorDocumentInput = z.infer<typeof vendorDocumentSchema>;

export const vendorBankAccountSchema = z.object({
    accountHolderName: z.string().trim().min(2).max(120),
    accountNumber: z.string().trim().regex(/^\d{6,34}$/, "Account number must contain 6 to 34 digits."),
    ifscCode: z.string().trim().toUpperCase().regex(/^[A-Z]{4}0[A-Z0-9]{6}$/, "Invalid IFSC code."),
    bankName: z.string().trim().min(2).max(120),
});

export type VendorBankAccountInput = z.infer<typeof vendorBankAccountSchema>;

export const vendorAddressSchema = z.object({
    type: z.enum(VENDOR_ADDRESS_TYPES),
    recipientName: z.string().trim().min(2).max(120),
    phone: z.string().trim().regex(/^\+?[1-9]\d{7,14}$/, "Invalid phone number."),
    addressLine1: z.string().trim().min(3).max(200),
    addressLine2: z.string().trim().max(200).optional(),
    city: z.string().trim().min(2).max(100),
    state: z.string().trim().min(2).max(100),
    postalCode: z.string().trim().min(3).max(20),
    country: z.string().trim().min(2).max(100),
});

export type VendorAddressInput = z.infer<typeof vendorAddressSchema>;

export const vendorStoreSchema = z.object({
    name: z.string().trim().min(2).max(120),
    slug: z.string().trim().toLowerCase().min(2).max(140).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug must contain lowercase letters, numbers, and hyphens."),
    description: z.string().trim().max(2000).optional(),
    logoUrl: z.string().trim().url().max(2048).optional(),
    bannerUrl: z.string().trim().url().max(2048).optional(),
});

export type VendorStoreInput = z.infer<typeof vendorStoreSchema>;

export const adminReviewSchema = z
    .object({
        decision: z.enum(["approve", "reject"]),
        rejectionReason: z.string().trim().min(5).max(1000).optional(),
    })
    .refine((value) => value.decision !== "reject" || Boolean(value.rejectionReason), {
        message: "A rejection reason is required.",
        path: ["rejectionReason"],
    });

export type AdminReviewInput = z.infer<typeof adminReviewSchema>;

export const vendorIdParamsSchema = z.object({
    vendorId: z.string().regex(/^[a-f\d]{24}$/i, "Invalid vendor ID."),
});
