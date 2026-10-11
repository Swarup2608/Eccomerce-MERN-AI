import { Router } from "express";
import { authenticate } from "../middleware/authenticate.js";
import { authorizeRoles } from "../middleware/authorizeRoles.js";
import { validate } from "../middleware/validate.js";
import { getDashboardStats, getUser, listUsers, updateUserRole, updateUserStatus } from "../module/Admin/admin.service.js";
import { listUsersQuerySchema, updateUserRoleSchema, updateUserStatusSchema, userIdParamsSchema, type ListUsersQuery, type UpdateUserRoleInput, type UpdateUserStatusInput } from "../module/Admin/admin.validation.js";
import { adminListProducts, createProductVariant, deleteProductVariant, getProductForAdmin, updateProduct, updateProductVariant } from "../module/Product/product.service.js";
import { adminListProductsSchema, createProductVariantSchema, productIdParamsSchema, productVariantParamsSchema, updateProductSchema, updateProductVariantSchema, type AdminListProductsInput, type CreateProductVariantInput, type UpdateProductInput, type UpdateProductVariantInput } from "../module/Product/product.validation.js";
import { getActor } from "../utils/actor.js";
import { handle, param } from "../utils/http.js";

const adminRouter = Router();

adminRouter.use(authenticate, authorizeRoles("admin", "super_admin"));

// Dashboard
adminRouter.get("/dashboard", handle(async () => ({ message: "Dashboard stats retrieved.", data: await getDashboardStats() })));

// Users
adminRouter.get("/users", validate({ query: listUsersQuerySchema }), handle(async (req) => ({ message: "Users retrieved.", data: await listUsers(req.query as unknown as ListUsersQuery) })));
adminRouter.get("/users/:userId", validate({ params: userIdParamsSchema }), handle(async (req) => ({ message: "User retrieved.", data: await getUser(param(req, "userId")) })));
adminRouter.patch(
    "/users/:userId/status",
    validate({ params: userIdParamsSchema, body: updateUserStatusSchema }),
    handle(async (req, res) => ({ message: "User status updated.", data: { user: await updateUserStatus(getActor(res), param(req, "userId"), req.body as UpdateUserStatusInput) } })),
);
adminRouter.patch(
    "/users/:userId/role",
    authorizeRoles("super_admin"),
    validate({ params: userIdParamsSchema, body: updateUserRoleSchema }),
    handle(async (req, res) => ({ message: "User role updated.", data: { user: await updateUserRole(getActor(res), param(req, "userId"), req.body as UpdateUserRoleInput) } })),
);

// Catalog products (creation stays at POST /products)
adminRouter.get("/products", validate({ query: adminListProductsSchema }), handle(async (req) => ({ message: "Products retrieved.", data: await adminListProducts(req.query as unknown as AdminListProductsInput) })));
adminRouter.get("/products/:productId", validate({ params: productIdParamsSchema }), handle(async (req) => ({ message: "Product retrieved.", data: await getProductForAdmin(param(req, "productId")) })));
adminRouter.patch(
    "/products/:productId",
    validate({ params: productIdParamsSchema, body: updateProductSchema }),
    handle(async (req) => ({ message: "Product updated.", data: { product: await updateProduct(param(req, "productId"), req.body as UpdateProductInput) } })),
);
adminRouter.post(
    "/products/:productId/variants",
    validate({ params: productIdParamsSchema, body: createProductVariantSchema }),
    handle(async (req) => ({ status: 201, message: "Variant created.", data: { variant: await createProductVariant(param(req, "productId"), req.body as CreateProductVariantInput) } })),
);
adminRouter.patch(
    "/products/:productId/variants/:variantId",
    validate({ params: productVariantParamsSchema, body: updateProductVariantSchema }),
    handle(async (req) => ({ message: "Variant updated.", data: { variant: await updateProductVariant(param(req, "productId"), param(req, "variantId"), req.body as UpdateProductVariantInput) } })),
);
adminRouter.delete(
    "/products/:productId/variants/:variantId",
    validate({ params: productVariantParamsSchema }),
    handle(async (req) => {
        await deleteProductVariant(param(req, "productId"), param(req, "variantId"));
        return { message: "Variant deleted." };
    }),
);

export default adminRouter;
