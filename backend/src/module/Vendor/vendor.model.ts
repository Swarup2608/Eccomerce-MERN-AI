import { Schema, Types, model } from "mongoose";
import { VENDOR_BUSINESS_TYPES, VENDOR_STATUSES, type VendorBusinessType, type VendorStatus } from "./vendor.constants.js";

export interface IVendor {
    userId: Types.ObjectId;
    businessName: string;
    businessType: VendorBusinessType;
    status: VendorStatus;
    rejectionReason?: string;
    // Overrides PLATFORM_COMMISSION_PERCENT for this vendor when set.
    commissionPercent?: number;
    suspensionReason?: string;
    // Actor ID: a user ObjectId string, or the Super Admin sentinel.
    reviewedBy?: string;
    reviewedAt?: Date;
    createdAt?: Date;
    updatedAt?: Date;
}

const vendorSchema = new Schema<IVendor>({
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    businessName: { type: String, required: true, trim: true, maxlength: 150 },
    businessType: { type: String, enum: Object.values(VENDOR_BUSINESS_TYPES), required: true },
    status: { type: String, enum: Object.values(VENDOR_STATUSES), default: VENDOR_STATUSES.PENDING, required: true },
    rejectionReason: { type: String, trim: true, maxlength: 1000 },
    commissionPercent: { type: Number, min: 0, max: 100 },
    suspensionReason: { type: String, trim: true, maxlength: 1000 },
    reviewedBy: { type: String, trim: true, maxlength: 64 },
    reviewedAt: { type: Date },
},{
    timestamps: true,
    versionKey: false,
});

// One vendor account per user; this is what blocks duplicate applications.
vendorSchema.index({ userId: 1 }, { unique: true });
vendorSchema.index({ status: 1, createdAt: -1 });

export const Vendor = model<IVendor>("Vendor", vendorSchema);
