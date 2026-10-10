import { Types, type SortOrder } from "mongoose";
import { AppError } from "../../errors/AppError.js";
import { Product } from "./product.model.js";
import type { CreateProductInput, ListProductsInput } from "./product.validation.js";

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

export async function listProducts(input: ListProductsInput) {
    const filter: Record<string, unknown> = { status: "active" };

    if (input.categoryId) {
        filter.categoryId = input.categoryId;
    }
    if (input.brand) {
        filter.brand = { $regex: `^${escapeRegex(input.brand)}$`, $options: "i" };
    }
    if (input.search) {
        filter.$text = { $search: input.search };
    }

    const skip = (input.page - 1) * input.limit;
    const sort: Record<string, SortOrder> = input.sortBy === "name" ? { name: 1, _id: 1 } : { createdAt: -1, _id: -1 };

    const [products, total] = await Promise.all([
        Product.find(filter).sort(sort).skip(skip).limit(input.limit).lean(),
        Product.countDocuments(filter),
    ]);

    return {
        products,
        pagination: {
            page: input.page,
            limit: input.limit,
            total,
            totalPages: Math.ceil(total / input.limit),
            hasNextPage: skip + products.length < total,
            hasPreviousPage: input.page > 1,
        },
    };
}

function escapeRegex(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
