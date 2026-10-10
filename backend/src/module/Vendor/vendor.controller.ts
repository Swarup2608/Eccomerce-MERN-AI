import type { RequestHandler, Response } from "express";
import { AppError } from "../../errors/AppError.js";
import { addAddress, addDocument, getMyOnboarding, listApplications, reviewApplication, saveBankAccount, saveStore, startOnboarding, submitOnboarding, updateBusiness } from "./vendor.service.js";
import type { AdminReviewInput, VendorAddressInput, VendorBankAccountInput, VendorBusinessInput, VendorDocumentInput, VendorStoreInput } from "./vendor.validation.js";

// Identity always comes from the verified access token, never from the request.
function getUserId(res: Response): string {
  const user = res.locals.user as { userId?: string } | undefined;

  if (!user?.userId) {
    throw new AppError("Authentication is required.", 401, "AUTHENTICATION_REQUIRED");
  }

  return user.userId;
}

export const startOnboardingController: RequestHandler = async (req, res, next) => {
  try {
    const data = await startOnboarding(getUserId(res), req.body as VendorBusinessInput);

    return res.status(201).json({
      success: true,
      message: "Vendor onboarding started.",
      data,
    });
  } catch (error) {
    return next(error);
  }
};

export const getMyOnboardingController: RequestHandler = async (_req, res, next) => {
  try {
    const data = await getMyOnboarding(getUserId(res));

    return res.status(200).json({
      success: true,
      message: "Vendor onboarding retrieved.",
      data,
    });
  } catch (error) {
    return next(error);
  }
};

export const updateBusinessController: RequestHandler = async (req, res, next) => {
  try {
    const vendor = await updateBusiness(getUserId(res), req.body as VendorBusinessInput);

    return res.status(200).json({
      success: true,
      message: "Business details updated.",
      data: { vendor },
    });
  } catch (error) {
    return next(error);
  }
};

export const addDocumentController: RequestHandler = async (req, res, next) => {
  try {
    const document = await addDocument(getUserId(res), req.body as VendorDocumentInput);

    return res.status(201).json({
      success: true,
      message: "Document metadata saved.",
      data: { document },
    });
  } catch (error) {
    return next(error);
  }
};

export const saveBankAccountController: RequestHandler = async (req, res, next) => {
  try {
    const bankAccount = await saveBankAccount(getUserId(res), req.body as VendorBankAccountInput);

    return res.status(200).json({
      success: true,
      message: "Bank details saved.",
      data: { bankAccount },
    });
  } catch (error) {
    return next(error);
  }
};

export const addAddressController: RequestHandler = async (req, res, next) => {
  try {
    const address = await addAddress(getUserId(res), req.body as VendorAddressInput);

    return res.status(201).json({
      success: true,
      message: "Vendor address saved.",
      data: { address },
    });
  } catch (error) {
    return next(error);
  }
};

export const saveStoreController: RequestHandler = async (req, res, next) => {
  try {
    const store = await saveStore(getUserId(res), req.body as VendorStoreInput);

    return res.status(200).json({
      success: true,
      message: "Store details saved.",
      data: { store },
    });
  } catch (error) {
    return next(error);
  }
};

export const submitOnboardingController: RequestHandler = async (_req, res, next) => {
  try {
    const application = await submitOnboarding(getUserId(res));

    return res.status(200).json({
      success: true,
      message: "Vendor application submitted for review.",
      data: { application },
    });
  } catch (error) {
    return next(error);
  }
};

export const listApplicationsController: RequestHandler = async (_req, res, next) => {
  try {
    const applications = await listApplications();

    return res.status(200).json({
      success: true,
      message: "Submitted vendor applications retrieved.",
      data: { applications },
    });
  } catch (error) {
    return next(error);
  }
};

export const reviewApplicationController: RequestHandler = async (req, res, next) => {
  try {
    const vendorId = req.params.vendorId;
    if (typeof vendorId !== "string" || !vendorId.trim()) {
      return next(new AppError("A valid vendor ID is required.", 400, "VALIDATION_ERROR"));
    }

    const data = await reviewApplication(vendorId, getUserId(res), req.body as AdminReviewInput);

    return res.status(200).json({
      success: true,
      message: "Vendor application reviewed.",
      data,
    });
  } catch (error) {
    return next(error);
  }
};
