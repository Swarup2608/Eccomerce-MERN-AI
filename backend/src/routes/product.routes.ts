import { Router } from "express";
import { createProductController, getProductBySlugController, listProductsController } from "../module/Product/product.controller.js";
import { authenticate } from "../middleware/authenticate.js";
import { authorizeRoles } from "../middleware/authorizeRoles.js";

const productRouter = Router();

productRouter.get("/", listProductsController);
productRouter.get("/:slug", getProductBySlugController);
productRouter.post("/", authenticate, authorizeRoles("admin", "super_admin"), createProductController);

export default productRouter;
