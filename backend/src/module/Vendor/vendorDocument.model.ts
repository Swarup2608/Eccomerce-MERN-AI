import { Schema, Types, model } from "mongoose";
import { DOCUMENT_MIME_TYPES, VENDOR_DOCUMENT_STATUSES, VENDOR_DOCUMENT_TYPES, type VendorDocumentStatus, type VendorDocumentType } from "./vendor.constants.js";

export interface IVendorDocument {
    vendorId: Types.ObjectId;
    type: VendorDocumentType;
    // Key in private object storage, issued by a trusted upload flow. Never a public URL.
    storageKey: string;
    originalFileName: string;
    mimeType: string;
    status: VendorDocumentStatus;
    rejectionReason?: string;
    reviewedBy?: Types.ObjectId;
    reviewedAt?: Date;
    createdAt?: Date;
    updatedAt?: Date;
}

const vendorDocumentSchema = new Schema<IVendorDocument>({
    vendorId: { type: Schema.Types.ObjectId, ref: "Vendor", required: true },
    type: { type: String, enum: Object.values(VENDOR_DOCUMENT_TYPES), required: true },
    storageKey: { type: String, required: true, trim: true, maxlength: 500, select: false },
    originalFileName: { type: String, required: true, trim: true, maxlength: 255 },
    mimeType: { type: String, required: true, enum: DOCUMENT_MIME_TYPES },
    status: { type: String, enum: Object.values(VENDOR_DOCUMENT_STATUSES), default: VENDOR_DOCUMENT_STATUSES.PENDING, required: true },
    rejectionReason: { type: String, trim: true, maxlength: 1000 },
    reviewedBy: { type: Schema.Types.ObjectId, ref: "User" },
    reviewedAt: { type: Date },
},{
    timestamps: true,
    versionKey: false,
});

vendorDocumentSchema.index({ vendorId: 1, type: 1, status: 1 });

export const VendorDocument = model<IVendorDocument>("VendorDocument", vendorDocumentSchema);
