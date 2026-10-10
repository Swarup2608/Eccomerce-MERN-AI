import { Schema, model } from "mongoose";

export const VENDOR_PRODUCT_STATUSES = {
    DRAFT: "draft",
    ACTIVE: "active",
    PAUSED: "paused",
    ARCHIVED: "archived",
} as const;

export type VendorProductStatus = (typeof VENDOR_PRODUCT_STATUSES)[keyof typeof VENDOR_PRODUCT_STATUSES];

export interface IVendorProduct {
    vendorId: Schema.Types.ObjectId;
    productId: Schema.Types.ObjectId;
    sellerSku?: string;
    status: VendorProductStatus;
    createdAt?: Date;
    updatedAt?: Date;
}

const vendorProductSchema = new Schema<IVendorProduct>({
    vendorId: { type: Schema.Types.ObjectId, ref: "Vendor", required: true },
    productId: { type: Schema.Types.ObjectId, ref: "Product", required: true },
    sellerSku: { type: String, trim: true, uppercase: true, maxlength: 100, },
    status: { type: String, enum: Object.values(VENDOR_PRODUCT_STATUSES), default: VENDOR_PRODUCT_STATUSES.DRAFT, required: true },
},{
    timestamps: true,
    versionKey: false,
});

vendorProductSchema.index({ vendorId: 1, productId: 1 }, { unique: true });
vendorProductSchema.index({ productId: 1, status: 1 });
vendorProductSchema.index({ vendorId: 1, sellerSku: 1 }, { unique: true, partialFilterExpression: { sellerSku: { $exists: true } } });

export const VendorProduct = model<IVendorProduct>("VendorProduct", vendorProductSchema);