import { Schema, Types, model } from "mongoose";
import { VENDOR_ADDRESS_TYPES, type VendorAddressType } from "./vendor.constants.js";

export interface IVendorAddress {
    vendorId: Types.ObjectId;
    type: VendorAddressType;
    recipientName: string;
    phone: string;
    addressLine1: string;
    addressLine2?: string;
    city: string;
    state: string;
    postalCode: string;
    country: string;
    isDefault: boolean;
    createdAt?: Date;
    updatedAt?: Date;
}

const vendorAddressSchema = new Schema<IVendorAddress>({
    vendorId: { type: Schema.Types.ObjectId, ref: "Vendor", required: true },
    type: { type: String, enum: Object.values(VENDOR_ADDRESS_TYPES), required: true },
    recipientName: { type: String, required: true, trim: true, maxlength: 120 },
    phone: { type: String, required: true, trim: true, maxlength: 20 },
    addressLine1: { type: String, required: true, trim: true, maxlength: 200 },
    addressLine2: { type: String, trim: true, maxlength: 200 },
    city: { type: String, required: true, trim: true, maxlength: 100 },
    state: { type: String, required: true, trim: true, maxlength: 100 },
    postalCode: { type: String, required: true, trim: true, maxlength: 20 },
    country: { type: String, required: true, trim: true, maxlength: 100 },
    isDefault: { type: Boolean, default: false, required: true },
},{
    timestamps: true,
    versionKey: false,
});

vendorAddressSchema.index({ vendorId: 1, type: 1 });

export const VendorAddress = model<IVendorAddress>("VendorAddress", vendorAddressSchema);
