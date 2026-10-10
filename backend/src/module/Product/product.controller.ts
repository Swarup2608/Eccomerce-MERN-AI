import type { RequestHandler } from "express";
import { createProduct, getProductBySlug } from "./product.service.js";
import { createProductSchema } from "./product.validation.js";
import { AppError } from "../../errors/AppError.js";

export const createProductController: RequestHandler = async (req, res, next) => {
  try {
    const parsed = createProductSchema.safeParse(req.body);
    if (!parsed.success) {
      return next(new AppError("Invalid product data.", 400, "VALIDATION_ERROR"));
    }

    const product = await createProduct(parsed.data);

    return res.status(201).json({
      success: true,
      message: "Product created successfully.",
      data: { product },
    });
  } catch (error) {
    return next(error);
  }
};

export const getProductBySlugController: RequestHandler = async (req, res, next) => {
  try {
    const slug = req.params.slug;
    if (typeof slug !== "string" || !slug.trim()) {
      return next(new AppError("A valid product slug is required.", 400, "VALIDATION_ERROR"));
    }

    const product = await getProductBySlug(slug);

    return res.status(200).json({
      success: true,
      message: "Product retrieved successfully.",
      data: { product },
    });
  } catch (error) {
    return next(error);
  }
};
