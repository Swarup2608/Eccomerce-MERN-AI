import type { RequestHandler } from "express";
import { createCategory, getCategoryBySlug, listCategories } from "./category.service.js";
import { createCategorySchema, listCategoriesSchema } from "./category.validation.js";
import { AppError } from "../../errors/AppError.js";

export const createCategoryController: RequestHandler = async (req, res, next) => {
  try {
    const parsed = createCategorySchema.safeParse(req.body);
    if (!parsed.success) {
      return next(new AppError("Invalid category data.", 400, "VALIDATION_ERROR"));
    }

    const category = await createCategory(parsed.data);

    return res.status(201).json({
      success: true,
      message: "Category created successfully.",
      data: { category },
    });
  } catch (error) {
    return next(error);
  }
};

export const listCategoriesController: RequestHandler = async (req, res, next) => {
  try {
    const parsed = listCategoriesSchema.safeParse(req.query);
    if (!parsed.success) {
      return next(new AppError("Invalid category query parameters.", 400, "VALIDATION_ERROR"));
    }

    const categories = await listCategories(parsed.data);

    return res.status(200).json({
      success: true,
      message: "Categories retrieved successfully.",
      data: { categories },
    });
  } catch (error) {
    return next(error);
  }
};

export const getCategoryBySlugController: RequestHandler = async (req, res, next) => {
  try {
    const slug = req.params.slug;
    if (typeof slug !== "string" || !slug.trim()) {
      return next(new AppError("A valid category slug is required.", 400, "VALIDATION_ERROR"));
    }

    const category = await getCategoryBySlug(slug);

    return res.status(200).json({
      success: true,
      message: "Category retrieved successfully.",
      data: { category },
    });
  } catch (error) {
    return next(error);
  }
};
