import { Types } from "mongoose";
import { AppError } from "../../errors/AppError.js";
import { ProductVariant } from "./productVariant.model.js";
import { VendorProduct, VENDOR_PRODUCT_STATUSES } from "./vendorProduct.model.js";
import { VendorProductVariant } from "./vendorProductVariant.model.js";
import type { CreateVendorProductVariantInput } from "./vendorProductVariant.validation.js";

// authenticatedVendorId must come from the verified session, never the request body.
export async function createVendorProductVariant(input: CreateVendorProductVariantInput, authenticatedVendorId: string) {
    if (!Types.ObjectId.isValid(authenticatedVendorId)) {
        throw new AppError("Invalid authenticated vendor.", 401, "INVALID_VENDOR_ID");
    }

    const vendorProduct = await VendorProduct.findById(input.vendorProductId).lean();

    if (!vendorProduct) {
        throw new AppError("Vendor product listing not found.", 404, "VENDOR_PRODUCT_NOT_FOUND");
    }

    if (String(vendorProduct.vendorId) !== authenticatedVendorId) {
        throw new AppError("You cannot modify another vendor's listing.", 403, "VENDOR_LISTING_FORBIDDEN");
    }

    if (vendorProduct.status === VENDOR_PRODUCT_STATUSES.ARCHIVED || vendorProduct.status === VENDOR_PRODUCT_STATUSES.PAUSED) {
        throw new AppError("Cannot add an offer to a paused or archived listing.", 409, "VENDOR_PRODUCT_INACTIVE");
    }

    const productVariant = await ProductVariant.findOne({ _id: input.productVariantId, productId: vendorProduct.productId }).select("_id").lean();

    if (!productVariant) {
        throw new AppError("The selected variant does not belong to this catalog product.", 400, "PRODUCT_VARIANT_MISMATCH");
    }

    try {
        return await VendorProductVariant.create({
            vendorProductId: new Types.ObjectId(input.vendorProductId),
            productVariantId: new Types.ObjectId(input.productVariantId),
            sellerSku: input.sellerSku,
            price: input.price,
            compareAtPrice: input.compareAtPrice,
        });
    } catch (error: unknown) {
        // Duplicate seller SKU, or this listing already has an offer for the variant.
        if (typeof error === "object" && error !== null && "code" in error && error.code === 11000) {
            throw new AppError("This seller SKU or product offer already exists.", 409, "VENDOR_OFFER_CONFLICT");
        }
        throw error;
    }
}
