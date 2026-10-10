import { Types } from "mongoose";
import { AppError } from "../../errors/AppError.js";
import { Product } from "./product.model.js";
import type { CreateProductInput } from "./product.validation.js";

export async function createProduct(input: CreateProductInput) {
    const existingProduct = await Product.findOne({ slug: input.slug }).select("_id").lean();

    if (existingProduct) {
        throw new AppError("A product with this slug already exists.", 409, "PRODUCT_SLUG_CONFLICT");
    }

    try {
        return await Product.create({ ...input, categoryId: new Types.ObjectId(input.categoryId) });
    } catch (error) {
        // Protect against concurrent requests that race on the unique index.
        if (typeof error === "object" && error !== null && "code" in error && error.code === 11000) {
            throw new AppError("A product with this slug already exists.", 409, "PRODUCT_SLUG_CONFLICT");
        }
        throw error;
    }
}

export async function getProductBySlug(slug: string) {
    const product = await Product.findOne({ slug, status: "active" }).lean();

    if (!product) {
        throw new AppError("Product not found.", 404, "PRODUCT_NOT_FOUND");
    }

    return product;
}
