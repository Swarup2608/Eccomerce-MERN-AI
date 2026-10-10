import { Schema, Types, model } from "mongoose";

export interface IVendorBankAccount {
    vendorId: Types.ObjectId;
    accountHolderName: string;
    accountNumber: string;
    ifscCode: string;
    bankName: string;
    isDefault: boolean;
    isVerified: boolean;
    createdAt?: Date;
    updatedAt?: Date;
}

const vendorBankAccountSchema = new Schema<IVendorBankAccount>({
    vendorId: { type: Schema.Types.ObjectId, ref: "Vendor", required: true },
    accountHolderName: { type: String, required: true, trim: true, maxlength: 120 },
    // select: false keeps these out of ordinary queries but is not encryption.
    // TODO: encrypt accountNumber at rest before handling real bank details.
    accountNumber: { type: String, required: true, trim: true, select: false },
    ifscCode: { type: String, required: true, trim: true, uppercase: true, match: /^[A-Z]{4}0[A-Z0-9]{6}$/, select: false },
    bankName: { type: String, required: true, trim: true, maxlength: 120 },
    isDefault: { type: Boolean, default: true, required: true },
    isVerified: { type: Boolean, default: false, required: true },
},{
    timestamps: true,
    versionKey: false,
});

// One payout account per vendor; the service upserts it.
vendorBankAccountSchema.index({ vendorId: 1 }, { unique: true });

export const VendorBankAccount = model<IVendorBankAccount>("VendorBankAccount", vendorBankAccountSchema);
