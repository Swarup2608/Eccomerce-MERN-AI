import { AppError } from "../../errors/AppError.js";
import { CategoryModel } from "./category.model.js";
import type { CreateCategoryInput, ListCategoriesInput } from "./category.validation.js";

export async function createCategory(input: CreateCategoryInput) {
    try {
        return await CategoryModel.create(input);
    } catch (error: unknown) {
        // Duplicate key on the unique slug index.
        if (typeof error === "object" && error !== null && "code" in error && error.code === 11000) {
            throw new AppError("A category with this slug already exists.", 409, "CATEGORY_SLUG_CONFLICT");
        }
        throw error;
    }
}

export async function listCategories(input: ListCategoriesInput) {
    const filter = input.includeInactive ? {} : { isActive: true };

    return CategoryModel.find(filter).sort({ sortOrder: 1, name: 1 }).lean();
}

export async function getCategoryBySlug(slug: string) {
    const category = await CategoryModel.findOne({ slug, isActive: true }).lean();

    if (!category) {
        throw new AppError("Category not found.", 404, "CATEGORY_NOT_FOUND");
    }

    return category;
}
