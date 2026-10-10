import { Schema, Types, model } from "mongoose";

export interface IVendorBankAccount {
    vendorId: Types.ObjectId;
    accountHolderName: string;
    // AES-256-GCM ciphertext (see utils/encryption.ts); never the raw number.
    accountNumber: string;
    accountNumberLast4: string;
    ifscCode: string;
    bankName: string;
    isDefault: boolean;
    isVerified: boolean;
    verifiedBy?: string;
    verifiedAt?: Date;
    createdAt?: Date;
    updatedAt?: Date;
}

const vendorBankAccountSchema = new Schema<IVendorBankAccount>({
    vendorId: { type: Schema.Types.ObjectId, ref: "Vendor", required: true },
    accountHolderName: { type: String, required: true, trim: true, maxlength: 120 },
    accountNumber: { type: String, required: true, trim: true, select: false },
    accountNumberLast4: { type: String, required: true, trim: true, maxlength: 4 },
    ifscCode: { type: String, required: true, trim: true, uppercase: true, match: /^[A-Z]{4}0[A-Z0-9]{6}$/ },
    bankName: { type: String, required: true, trim: true, maxlength: 120 },
    isDefault: { type: Boolean, default: true, required: true },
    isVerified: { type: Boolean, default: false, required: true },
    verifiedBy: { type: String, trim: true, maxlength: 64 },
    verifiedAt: { type: Date },
},{
    timestamps: true,
    versionKey: false,
});

// One payout account per vendor; the service upserts it.
vendorBankAccountSchema.index({ vendorId: 1 }, { unique: true });

export const VendorBankAccount = model<IVendorBankAccount>("VendorBankAccount", vendorBankAccountSchema);
