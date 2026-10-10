import { ApiError, apiRequest, type ApiResponse } from "./client";

export type UploadPurpose = "vendor_document" | "store_branding" | "product_image";

type UploadSignature =
    | { provider: "none"; folder: string; type: string }
    | { provider: "cloudinary"; cloudName: string; apiKey: string; uploadUrl: string; timestamp: number; signature: string; folder: string; type: string };

export interface UploadResult {
    // Cloudinary public ID; for private documents this is the storage key.
    publicId: string;
    // Delivery URL for public uploads (store branding, product images).
    url: string | null;
}

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

function safeName(fileName: string): string {
    return fileName.replace(/\.[^.]+$/, "").replace(/[^a-zA-Z0-9_-]+/g, "-").slice(0, 60) || "file";
}

// Uploads straight from the browser to Cloudinary with a server-issued signature,
// so files never pass through the API. Without Cloudinary (local dev only) the
// server returns provider "none" and we just mint a key inside the given folder.
export async function uploadFile(file: File, purpose: UploadPurpose): Promise<UploadResult> {
    if (file.size > MAX_UPLOAD_BYTES) {
        throw new ApiError("Files must be 10 MB or smaller.", 400, "FILE_TOO_LARGE");
    }

    const { data: signature } = await apiRequest<ApiResponse<UploadSignature>>("/uploads/signature", {
        method: "POST",
        body: JSON.stringify({ purpose }),
    });

    if (signature.provider === "none") {
        return { publicId: `${signature.folder}/${Date.now()}-${safeName(file.name)}`, url: null };
    }

    const form = new FormData();
    form.append("file", file);
    form.append("api_key", signature.apiKey);
    form.append("timestamp", String(signature.timestamp));
    form.append("signature", signature.signature);
    form.append("folder", signature.folder);
    if (signature.type === "authenticated") {
        form.append("type", "authenticated");
    }

    const response = await fetch(signature.uploadUrl, { method: "POST", body: form });
    const body = (await response.json().catch(() => null)) as { public_id?: string; secure_url?: string; error?: { message?: string } } | null;

    if (!response.ok || !body?.public_id) {
        throw new ApiError(body?.error?.message ?? "Upload failed. Please try again.", response.status, "UPLOAD_FAILED");
    }

    return { publicId: body.public_id, url: signature.type === "authenticated" ? null : (body.secure_url ?? null) };
}
