import { getActor } from "../../utils/actor.js";
import { handle, param } from "../../utils/http.js";
import { addAddress, addDocument, changeVendorStatus, deleteAddress, deleteDocument, getDocumentDownloadUrl, getMyOnboarding, getVendorDetail, listApplications, listVendors, reviewApplication, reviewDocument, saveBankAccount, saveStore, setVendorCommission, startOnboarding, submitOnboarding, updateAddress, updateBusiness } from "./vendor.service.js";
import type { AdminReviewInput, DocumentReviewInput, ListApplicationsQuery, ListVendorsQuery, VendorAddressInput, VendorAddressUpdateInput, VendorBankAccountInput, VendorBusinessInput, VendorCommissionInput, VendorDocumentInput, VendorStatusChangeInput, VendorStoreInput } from "./vendor.validation.js";

// Vendor-owner onboarding

export const startOnboardingController = handle(async (req, res) => ({
    status: 201,
    message: "Vendor onboarding started.",
    data: await startOnboarding(getActor(res).userId, req.body as VendorBusinessInput),
}));

export const getMyOnboardingController = handle(async (_req, res) => ({
    message: "Vendor onboarding retrieved.",
    data: await getMyOnboarding(getActor(res).userId),
}));

export const updateBusinessController = handle(async (req, res) => ({
    message: "Business details updated.",
    data: { vendor: await updateBusiness(getActor(res).userId, req.body as VendorBusinessInput) },
}));

export const addDocumentController = handle(async (req, res) => ({
    status: 201,
    message: "Document saved.",
    data: { document: await addDocument(getActor(res).userId, req.body as VendorDocumentInput) },
}));

export const deleteDocumentController = handle(async (req, res) => {
    await deleteDocument(getActor(res).userId, param(req, "documentId"));
    return { message: "Document removed." };
});

export const saveBankAccountController = handle(async (req, res) => ({
    message: "Bank details saved.",
    data: { bankAccount: await saveBankAccount(getActor(res).userId, req.body as VendorBankAccountInput) },
}));

export const addAddressController = handle(async (req, res) => ({
    status: 201,
    message: "Vendor address saved.",
    data: { address: await addAddress(getActor(res).userId, req.body as VendorAddressInput) },
}));

export const updateAddressController = handle(async (req, res) => ({
    message: "Vendor address updated.",
    data: { address: await updateAddress(getActor(res).userId, param(req, "addressId"), req.body as VendorAddressUpdateInput) },
}));

export const deleteAddressController = handle(async (req, res) => {
    await deleteAddress(getActor(res).userId, param(req, "addressId"));
    return { message: "Vendor address removed." };
});

export const saveStoreController = handle(async (req, res) => ({
    message: "Store details saved.",
    data: { store: await saveStore(getActor(res).userId, req.body as VendorStoreInput) },
}));

export const submitOnboardingController = handle(async (_req, res) => ({
    message: "Vendor application submitted for review.",
    data: { application: await submitOnboarding(getActor(res).userId) },
}));

// Admin review

export const listApplicationsController = handle(async (req) => ({
    message: "Vendor applications retrieved.",
    data: await listApplications(req.query as unknown as ListApplicationsQuery),
}));

export const reviewApplicationController = handle(async (req, res) => ({
    message: "Vendor application reviewed.",
    data: await reviewApplication(param(req, "vendorId"), getActor(res).userId, req.body as AdminReviewInput),
}));

export const listVendorsController = handle(async (req) => ({
    message: "Vendors retrieved.",
    data: await listVendors(req.query as unknown as ListVendorsQuery),
}));

export const getVendorDetailController = handle(async (req) => ({
    message: "Vendor retrieved.",
    data: await getVendorDetail(param(req, "vendorId")),
}));

export const getDocumentDownloadController = handle(async (req) => ({
    message: "Document link created.",
    data: await getDocumentDownloadUrl(param(req, "vendorId"), param(req, "documentId")),
}));

export const reviewDocumentController = handle(async (req, res) => ({
    message: "Document reviewed.",
    data: { document: await reviewDocument(param(req, "vendorId"), param(req, "documentId"), getActor(res).userId, req.body as DocumentReviewInput) },
}));

export const changeVendorStatusController = handle(async (req, res) => ({
    message: "Vendor status updated.",
    data: { vendor: await changeVendorStatus(param(req, "vendorId"), getActor(res).userId, req.body as VendorStatusChangeInput) },
}));

export const setVendorCommissionController = handle(async (req) => ({
    message: "Vendor commission updated.",
    data: { vendor: await setVendorCommission(param(req, "vendorId"), req.body as VendorCommissionInput) },
}));
