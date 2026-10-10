import { Router } from "express";
import { addAddressController, addDocumentController, getMyOnboardingController, listApplicationsController, reviewApplicationController, saveBankAccountController, saveStoreController, startOnboardingController, submitOnboardingController, updateBusinessController } from "../module/Vendor/vendor.controller.js";
import { adminReviewSchema, vendorAddressSchema, vendorBankAccountSchema, vendorBusinessSchema, vendorDocumentSchema, vendorIdParamsSchema, vendorStoreSchema } from "../module/Vendor/vendor.validation.js";
import { authenticate } from "../middleware/authenticate.js";
import { authorizeRoles } from "../middleware/authorizeRoles.js";
import { validate } from "../middleware/validate.js";

const vendorRouter = Router();

// Every onboarding route requires a signed-in user.
vendorRouter.use(authenticate);

vendorRouter.post("/start", validate({ body: vendorBusinessSchema }), startOnboardingController);
vendorRouter.get("/me", getMyOnboardingController);
vendorRouter.patch("/business", validate({ body: vendorBusinessSchema }), updateBusinessController);
vendorRouter.post("/documents", validate({ body: vendorDocumentSchema }), addDocumentController);
vendorRouter.post("/bank-account", validate({ body: vendorBankAccountSchema }), saveBankAccountController);
vendorRouter.post("/addresses", validate({ body: vendorAddressSchema }), addAddressController);
vendorRouter.put("/store", validate({ body: vendorStoreSchema }), saveStoreController);
vendorRouter.post("/submit", submitOnboardingController);

vendorRouter.get("/admin/applications", authorizeRoles("admin", "super_admin"), listApplicationsController);
vendorRouter.patch("/admin/applications/:vendorId/review", authorizeRoles("admin", "super_admin"), validate({ params: vendorIdParamsSchema, body: adminReviewSchema }), reviewApplicationController);

export default vendorRouter;
