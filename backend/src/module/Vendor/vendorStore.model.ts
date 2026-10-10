import { Schema, Types, model } from "mongoose";

export interface IVendorStore {
    vendorId: Types.ObjectId;
    name: string;
    slug: string;
    description?: string;
    logoUrl?: string;
    bannerUrl?: string;
    // Stays false until the vendor is approved.
    isPublished: boolean;
    createdAt?: Date;
    updatedAt?: Date;
}

const vendorStoreSchema = new Schema<IVendorStore>({
    vendorId: { type: Schema.Types.ObjectId, ref: "Vendor", required: true },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    slug: { type: String, required: true, trim: true, lowercase: true, maxlength: 140 },
    description: { type: String, trim: true, maxlength: 2000 },
    logoUrl: { type: String, trim: true, maxlength: 2048 },
    bannerUrl: { type: String, trim: true, maxlength: 2048 },
    isPublished: { type: Boolean, default: false, required: true },
},{
    timestamps: true,
    versionKey: false,
});

// One store per vendor, and store slugs are unique across the marketplace.
vendorStoreSchema.index({ vendorId: 1 }, { unique: true });
vendorStoreSchema.index({ slug: 1 }, { unique: true });

export const VendorStore = model<IVendorStore>("VendorStore", vendorStoreSchema);
