import { Types } from "mongoose";
import { z } from "zod";
import { AppError } from "../errors/AppError.js";

export const objectIdSchema = z.string().regex(/^[a-f\d]{24}$/i, "Invalid identifier.");

export function toObjectId(id: string | Types.ObjectId, code = "INVALID_ID"): Types.ObjectId {
    if (id instanceof Types.ObjectId) {
        return id;
    }
    if (!Types.ObjectId.isValid(id) || !/^[a-f\d]{24}$/i.test(id)) {
        throw new AppError("Invalid identifier.", 400, code);
    }
    return new Types.ObjectId(id);
}

export function isDuplicateKeyError(error: unknown, field?: string): boolean {
    if (typeof error !== "object" || error === null || !("code" in error) || error.code !== 11000) {
        return false;
    }
    if (!field) {
        return true;
    }
    const keyPattern = "keyPattern" in error ? (error.keyPattern as Record<string, unknown> | undefined) : undefined;
    return Boolean(keyPattern && field in keyPattern);
}

export function escapeRegex(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
