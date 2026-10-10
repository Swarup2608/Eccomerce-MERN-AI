import { createHash } from "node:crypto";
import { env } from "../config/env.js";
import { AppError } from "../errors/AppError.js";

// Thin wrapper over Cloudinary's REST API; no SDK needed for signed uploads,
// existence checks and private download links.

interface CloudinaryConfig {
    cloudName: string;
    apiKey: string;
    apiSecret: string;
}

export function getCloudinaryConfig(): CloudinaryConfig {
    if (!env.CLOUDINARY_CLOUD_NAME || !env.CLOUDINARY_API_KEY || !env.CLOUDINARY_API_SECRET) {
        throw new AppError("File uploads are not configured.", 503, "UPLOADS_NOT_CONFIGURED");
    }
    return { cloudName: env.CLOUDINARY_CLOUD_NAME, apiKey: env.CLOUDINARY_API_KEY, apiSecret: env.CLOUDINARY_API_SECRET };
}

export function isCloudinaryConfigured(): boolean {
    return Boolean(env.CLOUDINARY_CLOUD_NAME && env.CLOUDINARY_API_KEY && env.CLOUDINARY_API_SECRET);
}

// Cloudinary signature: SHA-1 of the alphabetically sorted params joined as
// key=value&key=value, with the API secret appended.
export function signCloudinaryParams(params: Record<string, string | number>, apiSecret: string): string {
    const toSign = Object.keys(params)
        .filter((key) => params[key] !== undefined && params[key] !== "")
        .sort()
        .map((key) => `${key}=${params[key]}`)
        .join("&");

    return createHash("sha1").update(`${toSign}${apiSecret}`).digest("hex");
}

export type CloudinaryDeliveryType = "upload" | "authenticated";

export interface SignedUploadParams {
    cloudName: string;
    apiKey: string;
    uploadUrl: string;
    timestamp: number;
    signature: string;
    folder: string;
    type: CloudinaryDeliveryType;
}

export function createSignedUpload(folder: string, type: CloudinaryDeliveryType): SignedUploadParams {
    const config = getCloudinaryConfig();
    const timestamp = Math.floor(Date.now() / 1000);
    const params: Record<string, string | number> = { folder, timestamp };

    if (type === "authenticated") {
        params.type = "authenticated";
    }

    return {
        cloudName: config.cloudName,
        apiKey: config.apiKey,
        uploadUrl: `https://api.cloudinary.com/v1_1/${config.cloudName}/image/upload`,
        timestamp,
        signature: signCloudinaryParams(params, config.apiSecret),
        folder,
        type,
    };
}

export async function cloudinaryResourceExists(publicId: string, type: CloudinaryDeliveryType): Promise<boolean> {
    const config = getCloudinaryConfig();
    const url = `https://api.cloudinary.com/v1_1/${config.cloudName}/resources/image/${type}/${publicId.split("/").map(encodeURIComponent).join("/")}`;
    const response = await fetch(url, {
        headers: { Authorization: `Basic ${Buffer.from(`${config.apiKey}:${config.apiSecret}`).toString("base64")}` },
    });

    if (response.status === 404) {
        return false;
    }
    if (!response.ok) {
        throw new AppError("Could not verify the uploaded file.", 502, "UPLOAD_VERIFICATION_FAILED");
    }
    return true;
}

const MIME_TO_FORMAT: Record<string, string> = {
    "application/pdf": "pdf",
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
};

// Short-lived link to a private (authenticated) asset, for admin document review.
export function createPrivateDownloadUrl(publicId: string, mimeType: string, expiresInSeconds = 300): string {
    const config = getCloudinaryConfig();
    const timestamp = Math.floor(Date.now() / 1000);
    const params: Record<string, string | number> = {
        public_id: publicId,
        format: MIME_TO_FORMAT[mimeType] ?? "pdf",
        type: "authenticated",
        timestamp,
        expires_at: timestamp + expiresInSeconds,
    };
    const signature = signCloudinaryParams(params, config.apiSecret);
    const query = new URLSearchParams({ ...Object.fromEntries(Object.entries(params).map(([key, value]) => [key, String(value)])), api_key: config.apiKey, signature });

    return `https://api.cloudinary.com/v1_1/${config.cloudName}/image/download?${query.toString()}`;
}
