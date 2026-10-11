import { Router, type RequestHandler } from "express";
import { createCategoryController, getCategoryBySlugController, listCategoriesController } from "../module/Category/category.controller.js";
import { deleteCategory, updateCategory } from "../module/Category/category.service.js";
import { categoryIdParamsSchema, updateCategorySchema, type UpdateCategoryInput } from "../module/Category/category.validation.js";
import { authenticate } from "../middleware/authenticate.js";
import { authorizeRoles } from "../middleware/authorizeRoles.js";
import { validate } from "../middleware/validate.js";
import { handle, param } from "../utils/http.js";

const requireAdmin = authorizeRoles("admin", "super_admin");

// Listing is public, but including inactive categories is admin only.
const authorizeInactiveListing: RequestHandler = (req, res, next) => {
    if (req.query.includeInactive !== "true") {
        return next();
    }

    return authenticate(req, res, (authError?: unknown) => {
        if (authError) return next(authError);
        return requireAdmin(req, res, next);
    });
};

const categoryRouter = Router();

categoryRouter.get("/", authorizeInactiveListing, listCategoriesController);
categoryRouter.get("/:slug", getCategoryBySlugController);
categoryRouter.post("/", authenticate, requireAdmin, createCategoryController);
categoryRouter.patch(
    "/:categoryId",
    authenticate,
    requireAdmin,
    validate({ params: categoryIdParamsSchema, body: updateCategorySchema }),
    handle(async (req) => ({ message: "Category updated.", data: { category: await updateCategory(param(req, "categoryId"), req.body as UpdateCategoryInput) } })),
);
categoryRouter.delete(
    "/:categoryId",
    authenticate,
    requireAdmin,
    validate({ params: categoryIdParamsSchema }),
    handle(async (req) => {
        await deleteCategory(param(req, "categoryId"));
        return { message: "Category deleted." };
    }),
);

export default categoryRouter;
