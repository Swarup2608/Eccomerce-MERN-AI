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

const objectId = (label: string) => z.string().regex(/^[a-f\d]{24}$/i, `Invalid ${label} ID.`);

export const documentIdParamsSchema = z.object({ documentId: objectId("document") });
export const addressIdParamsSchema = z.object({ addressId: objectId("address") });
export const vendorDocumentParamsSchema = z.object({ vendorId: objectId("vendor"), documentId: objectId("document") });

export const vendorAddressUpdateSchema = vendorAddressSchema.partial().refine((value) => Object.keys(value).length > 0, {
    message: "Provide at least one field to update.",
});

export type VendorAddressUpdateInput = z.infer<typeof vendorAddressUpdateSchema>;

export const documentReviewSchema = z
    .object({
        status: z.enum(["verified", "rejected"]),
        rejectionReason: z.string().trim().min(5).max(1000).optional(),
    })
    .refine((value) => value.status !== "rejected" || Boolean(value.rejectionReason), {
        message: "A rejection reason is required.",
        path: ["rejectionReason"],
    });

export type DocumentReviewInput = z.infer<typeof documentReviewSchema>;

export const listApplicationsQuerySchema = z.object({
    status: z.enum(["in_progress", "submitted", "approved", "rejected"]).default("submitted"),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type ListApplicationsQuery = z.infer<typeof listApplicationsQuerySchema>;

export const listVendorsQuerySchema = z.object({
    status: z.enum(["pending", "active", "suspended", "rejected"]).optional(),
    search: z.string().trim().max(100).optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type ListVendorsQuery = z.infer<typeof listVendorsQuerySchema>;

export const vendorStatusChangeSchema = z
    .object({
        action: z.enum(["suspend", "reactivate"]),
        reason: z.string().trim().min(5).max(1000).optional(),
    })
    .refine((value) => value.action !== "suspend" || Boolean(value.reason), {
        message: "A suspension reason is required.",
        path: ["reason"],
    });

export type VendorStatusChangeInput = z.infer<typeof vendorStatusChangeSchema>;

export const vendorCommissionSchema = z.object({
    // null clears the override so the platform default applies.
    commissionPercent: z.number().min(0).max(100).nullable(),
});

export type VendorCommissionInput = z.infer<typeof vendorCommissionSchema>;
