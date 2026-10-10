import { Router } from "express";
import { addAddressController, addDocumentController, changeVendorStatusController, deleteAddressController, deleteDocumentController, getDocumentDownloadController, getMyOnboardingController, getVendorDetailController, listApplicationsController, listVendorsController, reviewApplicationController, reviewDocumentController, saveBankAccountController, saveStoreController, setVendorCommissionController, startOnboardingController, submitOnboardingController, updateAddressController, updateBusinessController } from "../module/Vendor/vendor.controller.js";
import { addressIdParamsSchema, adminReviewSchema, documentIdParamsSchema, documentReviewSchema, listApplicationsQuerySchema, listVendorsQuerySchema, vendorAddressSchema, vendorAddressUpdateSchema, vendorBankAccountSchema, vendorBusinessSchema, vendorCommissionSchema, vendorDocumentParamsSchema, vendorDocumentSchema, vendorIdParamsSchema, vendorStatusChangeSchema, vendorStoreSchema } from "../module/Vendor/vendor.validation.js";
import { authenticate } from "../middleware/authenticate.js";
import { authorizeRoles } from "../middleware/authorizeRoles.js";
import { validate } from "../middleware/validate.js";

const vendorRouter = Router();
const requireAdmin = authorizeRoles("admin", "super_admin");

// Every onboarding route requires a signed-in user.
vendorRouter.use(authenticate);

// Applicant: business details and submission
vendorRouter.post("/start", validate({ body: vendorBusinessSchema }), startOnboardingController);
vendorRouter.get("/me", getMyOnboardingController);
vendorRouter.patch("/business", validate({ body: vendorBusinessSchema }), updateBusinessController);
vendorRouter.post("/submit", submitOnboardingController);

// Applicant: documents
vendorRouter.post("/documents", validate({ body: vendorDocumentSchema }), addDocumentController);
vendorRouter.delete("/documents/:documentId", validate({ params: documentIdParamsSchema }), deleteDocumentController);

// Applicant: bank account and store
vendorRouter.post("/bank-account", validate({ body: vendorBankAccountSchema }), saveBankAccountController);
vendorRouter.put("/store", validate({ body: vendorStoreSchema }), saveStoreController);

// Applicant: addresses
vendorRouter.post("/addresses", validate({ body: vendorAddressSchema }), addAddressController);
vendorRouter.patch(
    "/addresses/:addressId",
    validate({ params: addressIdParamsSchema, body: vendorAddressUpdateSchema }),
    updateAddressController,
);
vendorRouter.delete("/addresses/:addressId", validate({ params: addressIdParamsSchema }), deleteAddressController);

// Admin: application review
vendorRouter.get(
    "/admin/applications",
    requireAdmin,
    validate({ query: listApplicationsQuerySchema }),
    listApplicationsController,
);
vendorRouter.patch(
    "/admin/applications/:vendorId/review",
    requireAdmin,
    validate({ params: vendorIdParamsSchema, body: adminReviewSchema }),
    reviewApplicationController,
);

// Admin: vendor management
vendorRouter.get("/admin/vendors", requireAdmin, validate({ query: listVendorsQuerySchema }), listVendorsController);
vendorRouter.get("/admin/vendors/:vendorId", requireAdmin, validate({ params: vendorIdParamsSchema }), getVendorDetailController);
vendorRouter.patch(
    "/admin/vendors/:vendorId/status",
    requireAdmin,
    validate({ params: vendorIdParamsSchema, body: vendorStatusChangeSchema }),
    changeVendorStatusController,
);
vendorRouter.patch(
    "/admin/vendors/:vendorId/commission",
    requireAdmin,
    validate({ params: vendorIdParamsSchema, body: vendorCommissionSchema }),
    setVendorCommissionController,
);

// Admin: document review
vendorRouter.get(
    "/admin/vendors/:vendorId/documents/:documentId/download",
    requireAdmin,
    validate({ params: vendorDocumentParamsSchema }),
    getDocumentDownloadController,
);
vendorRouter.patch(
    "/admin/vendors/:vendorId/documents/:documentId",
    requireAdmin,
    validate({ params: vendorDocumentParamsSchema, body: documentReviewSchema }),
    reviewDocumentController,
);

export default vendorRouter;
