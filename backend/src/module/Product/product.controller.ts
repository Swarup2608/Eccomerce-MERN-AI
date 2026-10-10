import type { RequestHandler } from "express";
import { createProduct, getProductBySlug, listProducts } from "./product.service.js";
import { createProductSchema, listProductsSchema } from "./product.validation.js";
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

export const listProductsController: RequestHandler = async (req, res, next) => {
  try {
    const parsed = listProductsSchema.safeParse(req.query);
    if (!parsed.success) {
      return next(new AppError("Invalid product query parameters.", 400, "VALIDATION_ERROR"));
    }

    const result = await listProducts(parsed.data);

    return res.status(200).json({
      success: true,
      message: "Products retrieved successfully.",
      data: result,
    });
  } catch (error) {
    return next(error);
  }
};