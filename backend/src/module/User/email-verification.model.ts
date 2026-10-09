import {Schema,model,Types} from "mongoose";

export interface IEmailVerification {
    userId: Types.ObjectId;
    tokenHash: string;
    expiresAt: Date;
    usedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
}

const emailVerificationSchema = new Schema<IEmailVerification>({
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    tokenHash: { type: String, required: true, select: false },
    expiresAt: { type: Date, required: true },
    usedAt: { type: Date,default: null },
}, {
    timestamps: true,
    versionKey: false,
});

emailVerificationSchema.index({ userId: 1 }, { unique: true, partialFilterExpression: { usedAt: null } });

export const EmailVerification =  model<IEmailVerification>("EmailVerification", emailVerificationSchema);