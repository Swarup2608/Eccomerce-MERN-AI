import { Schema, Types, model } from "mongoose";
import { ONBOARDING_STATUSES, ONBOARDING_STEPS, type OnboardingStatus, type OnboardingStep } from "./vendor.constants.js";

export interface IVendorOnboarding {
    vendorId: Types.ObjectId;
    status: OnboardingStatus;
    currentStep: OnboardingStep;
    submittedAt?: Date;
    reviewedAt?: Date;
    reviewedBy?: Types.ObjectId;
    rejectionReason?: string;
    createdAt?: Date;
    updatedAt?: Date;
}

const vendorOnboardingSchema = new Schema<IVendorOnboarding>({
    vendorId: { type: Schema.Types.ObjectId, ref: "Vendor", required: true },
    status: { type: String, enum: Object.values(ONBOARDING_STATUSES), default: ONBOARDING_STATUSES.IN_PROGRESS, required: true },
    currentStep: { type: String, enum: Object.values(ONBOARDING_STEPS), default: ONBOARDING_STEPS.BUSINESS_DETAILS, required: true },
    submittedAt: { type: Date },
    reviewedAt: { type: Date },
    reviewedBy: { type: Schema.Types.ObjectId, ref: "User" },
    rejectionReason: { type: String, trim: true, maxlength: 1000 },
},{
    timestamps: true,
    versionKey: false,
});

// A single onboarding record per vendor.
vendorOnboardingSchema.index({ vendorId: 1 }, { unique: true });
// Admin review queue.
vendorOnboardingSchema.index({ status: 1, submittedAt: 1 });

export const VendorOnboarding = model<IVendorOnboarding>("VendorOnboarding", vendorOnboardingSchema);
