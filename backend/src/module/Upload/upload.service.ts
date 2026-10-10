import { env } from "../../config/env.js";
import { AppError } from "../../errors/AppError.js";
import type { AuthenticatedActor } from "../../utils/actor.js";
import { createSignedUpload, isCloudinaryConfigured, type CloudinaryDeliveryType } from "../../utils/cloudinary.js";
import { USER_ROLES } from "../User/user.validation.js";
import { getOwnedVendor, vendorDocumentFolder, vendorStoreFolder } from "../Vendor/vendor.service.js";
import type { UploadSignatureInput } from "./upload.validation.js";

// Outside production, a missing Cloudinary config yields a "none" provider: the
// client skips the upload and uses a key inside the returned folder, so the
// onboarding flow can be exercised locally without credentials.
function signFor(folder: string, type: CloudinaryDeliveryType) {
    if (!isCloudinaryConfigured() && env.NODE_ENV !== "production") {
        return { provider: "none" as const, folder, type };
    }
    return { provider: "cloudinary" as const, ...createSignedUpload(folder, type) };
}

// The server decides the folder and delivery type for each purpose; clients only
// pick the purpose. That is what lets addDocument trust a storage key's prefix.
export async function createUploadSignature(actor: AuthenticatedActor, input: UploadSignatureInput) {
    switch (input.purpose) {
        case "vendor_document": {
            const vendor = await getOwnedVendor(actor.userId);
            return signFor(vendorDocumentFolder(vendor._id), "authenticated");
        }
        case "store_branding": {
            const vendor = await getOwnedVendor(actor.userId);
            return signFor(vendorStoreFolder(vendor._id), "upload");
        }
        case "product_image": {
            if (actor.role !== USER_ROLES.ADMIN && actor.role !== USER_ROLES.SUPER_ADMIN) {
                throw new AppError("You do not have permission to upload product images.", 403, "FORBIDDEN");
            }
            return signFor("products", "upload");
        }
    }
}
