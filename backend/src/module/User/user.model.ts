import {Schema, model} from "mongoose";
import { USER_ROLES, USER_STATUSES, type UserRole, type UserStatus } from "./user.validation.js";

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
    passwordChangedAt: { type: Date, default: null }
},{
    timestamps: true,
    versionKey: false
});

userSchema.index({ email: 1 }, { unique: true });
userSchema.index({ userName: 1 }, { unique: true });
userSchema.index({ phoneNumber: 1 }, { unique: true, partialFilterExpression: { phoneNumber: { $type: "string" } } });
userSchema.index({ role: 1, status: 1 });

export const User = model<IUser>("User", userSchema);