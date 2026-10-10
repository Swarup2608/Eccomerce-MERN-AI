import { Router, type RequestHandler } from "express";
import { createCategoryController, getCategoryBySlugController, listCategoriesController } from "../module/Category/category.controller.js";
import { authenticate } from "../middleware/authenticate.js";
import { authorizeRoles } from "../middleware/authorizeRoles.js";

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

export default categoryRouter;
