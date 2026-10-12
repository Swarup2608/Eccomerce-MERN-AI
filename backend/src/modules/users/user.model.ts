import {Schema, model} from "mongoose";
import { USER_ROLES, USER_STATUSES, type BlockReason, type UserRole, type UserStatus } from "./user.validation.js";

export const UNVERIFIED_ACCOUNT_TTL_SEC = 7 * 24 * 60 * 60;

export interface IUser{
    firstName: string;
    lastName: string;
    email: string;
    userName: string;
    passwordHash: string;
    phoneNumber?: string;
    role: UserRole;
    status: UserStatus;
    emailVerified: boolean;
    phoneVerified: boolean;
    lastLoginAt?: Date;
    passwordChangedAt?: Date;
    // When true, signing in also needs a code emailed to the user (admins always need it).
    mfaEnabled?: boolean;
    // Temporary block (too many wrong passwords or codes, or verification emails). Sign-in is refused until this time,
    // unless the password is reset from an emailed link first.
    blockedUntil?: Date | null;
    blockedReason?: BlockReason | null;
    createdAt?: Date;
    updatedAt?: Date;
}

const userSchema = new Schema<IUser>({
    firstName: { type: String, required: true, trim: true, maxlength: 50 },
    lastName: { type: String, required: true, trim: true, maxlength: 50 },
    email: { type: String, required: true, trim: true, maxlength: 254, lowercase: true },
    userName: { type: String, required: true, trim: true, maxlength: 30, minlength:3, lowercase: true },
    passwordHash: { type: String, required: true, select: false },
    phoneNumber: { type: String, trim: true, match: /^\+?[1-9]\d{7,14}$/ },
    role: { type: String, enum: Object.values(USER_ROLES), default: USER_ROLES.USER, required: true },
    status: { type: String, enum: Object.values(USER_STATUSES), default: USER_STATUSES.ACTIVE, required: true },
    emailVerified: { type: Boolean, default: false, required: true },
    phoneVerified: { type: Boolean, default: false, required: true },
    lastLoginAt: { type: Date, default: null },
    passwordChangedAt: { type: Date, default: null },
    mfaEnabled: { type: Boolean, default: false },
    blockedUntil: { type: Date, default: null },
    blockedReason: { type: String, default: null }
},{
    timestamps: true,
    versionKey: false
});

userSchema.index({ email: 1 }, { unique: true });
userSchema.index({ userName: 1 }, { unique: true });
userSchema.index({ phoneNumber: 1 }, { unique: true, partialFilterExpression: { phoneNumber: { $type: "string" } } });
userSchema.index({ role: 1, status: 1 });
// Sign-ups that never verify their email are deleted, which frees the email (and username) to register again.
// Verifying flips emailVerified, so the document stops matching the filter and is kept.
userSchema.index({ createdAt: 1 }, { expireAfterSeconds: UNVERIFIED_ACCOUNT_TTL_SEC, partialFilterExpression: { emailVerified: false } });

export const User = model<IUser>("User", userSchema);
