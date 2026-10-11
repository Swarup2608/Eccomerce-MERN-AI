import mongoose, { type SortOrder } from "mongoose";
import { AppError } from "../../errors/AppError.js";
import { escapeRegex, isDuplicateKeyError, toObjectId } from "../../utils/ids.js";
import { buildPagination, skipFor } from "../../utils/pagination.js";
import { CategoryModel } from "../Category/category.model.js";
import { Product } from "./product.model.js";
import { buildVariantKey, ProductVariant } from "./productVariant.model.js";
import { VendorProductVariant } from "./vendorProductVariant.model.js";
import type { AdminListProductsInput, CreateProductInput, CreateProductVariantInput, ListProductsInput, UpdateProductInput, UpdateProductVariantInput } from "./product.validation.js";

const DEFAULT_VARIANT_ATTRIBUTES = { Variant: "Standard" };

async function assertCategoryExists(categoryId: string) {
    if (!(await CategoryModel.exists({ _id: toObjectId(categoryId) }))) {
        throw new AppError("Category not found.", 400, "CATEGORY_NOT_FOUND");
    }
}

// Rejects two variants of one product whose attributes normalise to the same key.
function buildVariantDocs(productId: mongoose.Types.ObjectId, variants: { attributes: Record<string, string> }[]) {
    const seen = new Set<string>();

    return variants.map((variant, index) => {
        const variantKey = buildVariantKey(variant.attributes);
        if (seen.has(variantKey)) {
            throw new AppError("Two variants have the same attributes.", 400, "DUPLICATE_VARIANT");
        }
        seen.add(variantKey);
        return { productId, attributes: variant.attributes, variantKey, isDefault: index === 0 };
    });
}

// The product and its variants are created together, so a product is never
// visible to sellers without at least one variant to list against.
export async function createProduct(input: CreateProductInput) {
    await assertCategoryExists(input.categoryId);

    const { variants, ...productInput } = input;
    const session = await mongoose.startSession();

    try {
        return await session.withTransaction(async () => {
            const [product] = await Product.create([{ ...productInput, categoryId: toObjectId(input.categoryId) }], { session });
            const variantDocs = buildVariantDocs(product!._id, variants?.length ? variants : [{ attributes: DEFAULT_VARIANT_ATTRIBUTES }]);
            await ProductVariant.create(variantDocs, { session, ordered: true });
            return product!;
        });
    } catch (error) {
        // Protect against concurrent requests that race on the unique index.
        if (isDuplicateKeyError(error, "slug")) {
            throw new AppError("A product with this slug already exists.", 409, "PRODUCT_SLUG_CONFLICT");
        }
        throw error;
    } finally {
        await session.endSession();
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
        filter.categoryId = toObjectId(input.categoryId);
    }
    if (input.brand) {
        filter.brand = { $regex: `^${escapeRegex(input.brand)}$`, $options: "i" };
    }
    if (input.search) {
        filter.$text = { $search: input.search };
    }

    const skip = skipFor(input.page, input.limit);
    const sort: Record<string, SortOrder> = input.sortBy === "name" ? { name: 1, _id: 1 } : { createdAt: -1, _id: -1 };

    const [products, total] = await Promise.all([
        Product.find(filter).sort(sort).skip(skip).limit(input.limit).lean(),
        Product.countDocuments(filter),
    ]);

    return { products, pagination: buildPagination(input.page, input.limit, total) };
}

// ---------------------------------------------------------------------------
// Admin catalog management
// ---------------------------------------------------------------------------

export async function adminListProducts(input: AdminListProductsInput) {
    const filter: Record<string, unknown> = {};

    if (input.status) filter.status = input.status;
    if (input.categoryId) filter.categoryId = toObjectId(input.categoryId);
    if (input.brand) filter.brand = { $regex: `^${escapeRegex(input.brand)}$`, $options: "i" };
    if (input.search) {
        filter.$or = [{ name: { $regex: escapeRegex(input.search), $options: "i" } }, { slug: { $regex: escapeRegex(input.search), $options: "i" } }];
    }

    const sort: Record<string, SortOrder> = input.sortBy === "name" ? { name: 1, _id: 1 } : { createdAt: -1, _id: -1 };

    const [products, total] = await Promise.all([
        Product.find(filter).sort(sort).skip(skipFor(input.page, input.limit)).limit(input.limit).populate("categoryId", "name slug").lean(),
        Product.countDocuments(filter),
    ]);

    const variantCounts = await ProductVariant.aggregate<{ _id: mongoose.Types.ObjectId; count: number }>([
        { $match: { productId: { $in: products.map((product) => product._id) } } },
        { $group: { _id: "$productId", count: { $sum: 1 } } },
    ]);
    const countByProduct = new Map(variantCounts.map((entry) => [entry._id.toString(), entry.count]));

    return {
        products: products.map((product) => ({ ...product, variantCount: countByProduct.get(product._id.toString()) ?? 0 })),
        pagination: buildPagination(input.page, input.limit, total),
    };
}

export async function getProductForAdmin(productId: string) {
    const id = toObjectId(productId);
    const [product, variants] = await Promise.all([
        Product.findById(id).populate("categoryId", "name slug").lean(),
        ProductVariant.find({ productId: id }).sort({ isDefault: -1, createdAt: 1 }).lean(),
    ]);

    if (!product) {
        throw new AppError("Product not found.", 404, "PRODUCT_NOT_FOUND");
    }

    const offerCounts = await VendorProductVariant.aggregate<{ _id: mongoose.Types.ObjectId; count: number }>([
        { $match: { productVariantId: { $in: variants.map((variant) => variant._id) } } },
        { $group: { _id: "$productVariantId", count: { $sum: 1 } } },
    ]);
    const offersByVariant = new Map(offerCounts.map((entry) => [entry._id.toString(), entry.count]));

    return {
        product,
        variants: variants.map((variant) => ({ ...variant, offerCount: offersByVariant.get(variant._id.toString()) ?? 0 })),
    };
}

export async function updateProduct(productId: string, input: UpdateProductInput) {
    if (input.categoryId) {
        await assertCategoryExists(input.categoryId);
    }

    try {
        const product = await Product.findByIdAndUpdate(
            toObjectId(productId),
            { $set: { ...input, ...(input.categoryId ? { categoryId: toObjectId(input.categoryId) } : {}) } },
            { returnDocument: "after", runValidators: true },
        ).lean();

        if (!product) {
            throw new AppError("Product not found.", 404, "PRODUCT_NOT_FOUND");
        }

        return product;
    } catch (error) {
        if (isDuplicateKeyError(error, "slug")) {
            throw new AppError("A product with this slug already exists.", 409, "PRODUCT_SLUG_CONFLICT");
        }
        throw error;
    }
}

async function setDefaultVariant(productId: mongoose.Types.ObjectId, variantId: mongoose.Types.ObjectId, session: mongoose.ClientSession) {
    // Clear first: the partial unique index allows only one default per product.
    await ProductVariant.updateMany({ productId, isDefault: true, _id: { $ne: variantId } }, { $set: { isDefault: false } }, { session });
    await ProductVariant.updateOne({ _id: variantId, productId }, { $set: { isDefault: true } }, { session });
}

export async function createProductVariant(productId: string, input: CreateProductVariantInput) {
    const id = toObjectId(productId);

    if (!(await Product.exists({ _id: id }))) {
        throw new AppError("Product not found.", 404, "PRODUCT_NOT_FOUND");
    }

    const session = await mongoose.startSession();

    try {
        return await session.withTransaction(async () => {
            const hasDefault = await ProductVariant.exists({ productId: id, isDefault: true }).session(session);
            const [variant] = await ProductVariant.create([{ productId: id, attributes: input.attributes, variantKey: buildVariantKey(input.attributes), isDefault: false }], { session });

            if (input.isDefault || !hasDefault) {
                await setDefaultVariant(id, variant!._id, session);
            }

            return ProductVariant.findById(variant!._id).session(session).lean();
        });
    } catch (error) {
        if (isDuplicateKeyError(error, "variantKey")) {
            throw new AppError("A variant with these attributes already exists.", 409, "DUPLICATE_VARIANT");
        }
        throw error;
    } finally {
        await session.endSession();
    }
}

export async function updateProductVariant(productId: string, variantId: string, input: UpdateProductVariantInput) {
    const productObjectId = toObjectId(productId);
    const variantObjectId = toObjectId(variantId);
    const session = await mongoose.startSession();

    try {
        return await session.withTransaction(async () => {
            const variant = await ProductVariant.findOne({ _id: variantObjectId, productId: productObjectId }).session(session);

            if (!variant) {
                throw new AppError("Variant not found.", 404, "VARIANT_NOT_FOUND");
            }

            if (input.attributes) {
                variant.attributes = new Map(Object.entries(input.attributes));
                variant.variantKey = buildVariantKey(input.attributes);
                await variant.save({ session });
            }
            if (input.isDefault) {
                await setDefaultVariant(productObjectId, variantObjectId, session);
            }

            return ProductVariant.findById(variantObjectId).session(session).lean();
        });
    } catch (error) {
        if (isDuplicateKeyError(error, "variantKey")) {
            throw new AppError("A variant with these attributes already exists.", 409, "DUPLICATE_VARIANT");
        }
        throw error;
    } finally {
        await session.endSession();
    }
}

// A variant that sellers already offer cannot be deleted; archive the product instead.
export async function deleteProductVariant(productId: string, variantId: string) {
    const productObjectId = toObjectId(productId);
    const variantObjectId = toObjectId(variantId);

    if (await VendorProductVariant.exists({ productVariantId: variantObjectId })) {
        throw new AppError("Sellers already offer this variant, so it cannot be deleted.", 409, "VARIANT_IN_USE");
    }

    const session = await mongoose.startSession();

    try {
        await session.withTransaction(async () => {
            const count = await ProductVariant.countDocuments({ productId: productObjectId }).session(session);
            if (count <= 1) {
                throw new AppError("A product needs at least one variant.", 409, "LAST_VARIANT");
            }

            const variant = await ProductVariant.findOneAndDelete({ _id: variantObjectId, productId: productObjectId }, { session }).lean();
            if (!variant) {
                throw new AppError("Variant not found.", 404, "VARIANT_NOT_FOUND");
            }

            // Promote the oldest remaining variant when the default is removed.
            if (variant.isDefault) {
                const next = await ProductVariant.findOne({ productId: productObjectId }).sort({ createdAt: 1 }).session(session).lean();
                if (next) {
                    await setDefaultVariant(productObjectId, next._id, session);
                }
            }
        });
    } finally {
        await session.endSession();
    }
}
