import mongoose, { Types } from "mongoose";
import { AppError } from "../../errors/AppError.js";
import { User } from "../User/user.model.js";
import { USER_ROLES } from "../User/user.validation.js";
import { ONBOARDING_STATUSES, ONBOARDING_STEPS, VENDOR_ADDRESS_TYPES, VENDOR_DOCUMENT_STATUSES, VENDOR_STATUSES } from "./vendor.constants.js";
import { Vendor } from "./vendor.model.js";
import { VendorAddress } from "./vendorAddress.model.js";
import { VendorBankAccount } from "./vendorBankAccount.model.js";
import { VendorDocument } from "./vendorDocument.model.js";
import { VendorOnboarding } from "./vendorOnboarding.model.js";
import { VendorStore } from "./vendorStore.model.js";
import type { AdminReviewInput, VendorAddressInput, VendorBankAccountInput, VendorBusinessInput, VendorDocumentInput, VendorStoreInput } from "./vendor.validation.js";

function toObjectId(id: string): Types.ObjectId {
    if (!Types.ObjectId.isValid(id)) {
        throw new AppError("Invalid identifier.", 400, "INVALID_ID");
    }
    return new Types.ObjectId(id);
}

function isDuplicateKeyError(error: unknown, field?: string): boolean {
    if (typeof error !== "object" || error === null || !("code" in error) || error.code !== 11000) {
        return false;
    }
    if (!field) {
        return true;
    }
    const keyPattern = "keyPattern" in error ? (error.keyPattern as Record<string, unknown> | undefined) : undefined;
    return Boolean(keyPattern && field in keyPattern);
}

async function getOwnedVendor(userId: string) {
    const vendor = await Vendor.findOne({ userId: toObjectId(userId) });

    if (!vendor) {
        throw new AppError("Start your vendor application first.", 404, "VENDOR_NOT_FOUND");
    }

    return vendor;
}

// Owners can edit while the application is in progress, or after a rejection
// so they can correct it and resubmit.
async function ensureEditable(vendorId: Types.ObjectId) {
    const application = await VendorOnboarding.findOne({ vendorId }).select("status").lean();

    if (application && application.status !== ONBOARDING_STATUSES.IN_PROGRESS && application.status !== ONBOARDING_STATUSES.REJECTED) {
        throw new AppError("This application cannot currently be edited.", 409, "ONBOARDING_NOT_EDITABLE");
    }
}

export async function startOnboarding(userId: string, input: VendorBusinessInput) {
    const userObjectId = toObjectId(userId);
    let vendor = await Vendor.findOne({ userId: userObjectId });

    if (!vendor) {
        try {
            vendor = await Vendor.create({ userId: userObjectId, businessName: input.businessName, businessType: input.businessType });
        } catch (error) {
            // A concurrent request created the vendor first; reuse it.
            if (!isDuplicateKeyError(error)) {
                throw error;
            }
            vendor = await Vendor.findOne({ userId: userObjectId });
            if (!vendor) {
                throw error;
            }
        }
    }

    // Upsert so a retry after a partial failure still ends with exactly one application.
    const application = await VendorOnboarding.findOneAndUpdate(
        { vendorId: vendor._id },
        { $setOnInsert: { vendorId: vendor._id } },
        { upsert: true, returnDocument: "after" },
    );

    return { vendor, application };
}

export async function getMyOnboarding(userId: string) {
    const vendor = await getOwnedVendor(userId);

    // storageKey, accountNumber and ifscCode are select: false, so they are not returned.
    const [application, store, addresses, documents, bankAccount] = await Promise.all([
        VendorOnboarding.findOne({ vendorId: vendor._id }).lean(),
        VendorStore.findOne({ vendorId: vendor._id }).lean(),
        VendorAddress.find({ vendorId: vendor._id }).lean(),
        VendorDocument.find({ vendorId: vendor._id }).lean(),
        VendorBankAccount.findOne({ vendorId: vendor._id }).lean(),
    ]);

    return { vendor, application, store, addresses, documents, bankAccount };
}

export async function updateBusiness(userId: string, input: VendorBusinessInput) {
    const vendor = await getOwnedVendor(userId);
    await ensureEditable(vendor._id);

    vendor.businessName = input.businessName;
    vendor.businessType = input.businessType;
    await vendor.save();

    return vendor;
}

export async function addDocument(userId: string, input: VendorDocumentInput) {
    const vendor = await getOwnedVendor(userId);
    await ensureEditable(vendor._id);

    // TODO: verify the storage key was issued to this vendor by the signed-upload flow.
    const document = await VendorDocument.create({ vendorId: vendor._id, ...input, status: VENDOR_DOCUMENT_STATUSES.PENDING });

    return document.toObject();
}

export async function saveBankAccount(userId: string, input: VendorBankAccountInput) {
    const vendor = await getOwnedVendor(userId);
    await ensureEditable(vendor._id);

    // Changing bank details resets verification. TODO: encrypt accountNumber before persisting.
    return VendorBankAccount.findOneAndUpdate(
        { vendorId: vendor._id },
        { $set: { ...input, isDefault: true, isVerified: false }, $setOnInsert: { vendorId: vendor._id } },
        { upsert: true, returnDocument: "after", runValidators: true },
    ).lean();
}

export async function addAddress(userId: string, input: VendorAddressInput) {
    const vendor = await getOwnedVendor(userId);
    await ensureEditable(vendor._id);

    return VendorAddress.create({ vendorId: vendor._id, ...input, isDefault: false });
}

export async function saveStore(userId: string, input: VendorStoreInput) {
    const vendor = await getOwnedVendor(userId);
    await ensureEditable(vendor._id);

    try {
        return await VendorStore.findOneAndUpdate(
            { vendorId: vendor._id },
            { $set: { ...input, isPublished: false }, $setOnInsert: { vendorId: vendor._id } },
            { upsert: true, returnDocument: "after", runValidators: true },
        ).lean();
    } catch (error) {
        if (isDuplicateKeyError(error, "slug")) {
            throw new AppError("This store slug is already in use.", 409, "STORE_SLUG_CONFLICT");
        }
        throw error;
    }
}

export async function submitOnboarding(userId: string) {
    const vendor = await getOwnedVendor(userId);

    const [store, businessAddress, bankAccount, documentCount] = await Promise.all([
        VendorStore.exists({ vendorId: vendor._id }),
        VendorAddress.exists({ vendorId: vendor._id, type: VENDOR_ADDRESS_TYPES.BUSINESS }),
        VendorBankAccount.exists({ vendorId: vendor._id }),
        VendorDocument.countDocuments({ vendorId: vendor._id, status: { $ne: VENDOR_DOCUMENT_STATUSES.REJECTED } }),
    ]);

    if (!vendor.businessName || !vendor.businessType) {
        throw new AppError("Business details are required.", 400, "BUSINESS_DETAILS_REQUIRED");
    }

    if (!store || !businessAddress || !bankAccount || documentCount === 0) {
        throw new AppError("Complete store, business address, bank and document details before submitting.", 400, "ONBOARDING_INCOMPLETE");
    }

    // Conditional update so a concurrent review or double submit cannot be overwritten.
    const application = await VendorOnboarding.findOneAndUpdate(
        { vendorId: vendor._id, status: { $in: [ONBOARDING_STATUSES.IN_PROGRESS, ONBOARDING_STATUSES.REJECTED] } },
        { $set: { status: ONBOARDING_STATUSES.SUBMITTED, currentStep: ONBOARDING_STEPS.REVIEW, submittedAt: new Date() }, $unset: { rejectionReason: 1 } },
        { returnDocument: "after" },
    );

    if (!application) {
        const exists = await VendorOnboarding.exists({ vendorId: vendor._id });
        if (!exists) {
            throw new AppError("Vendor application not found.", 404, "ONBOARDING_NOT_FOUND");
        }
        throw new AppError("This application has already been submitted.", 409, "ONBOARDING_NOT_EDITABLE");
    }

    if (vendor.status === VENDOR_STATUSES.REJECTED) {
        await Vendor.updateOne({ _id: vendor._id }, { $set: { status: VENDOR_STATUSES.PENDING }, $unset: { rejectionReason: 1 } });
    }

    return application;
}

export async function listApplications() {
    return VendorOnboarding.find({ status: ONBOARDING_STATUSES.SUBMITTED })
        .sort({ submittedAt: 1 })
        .populate("vendorId", "userId businessName businessType status")
        .lean();
}

export async function reviewApplication(vendorId: string, adminUserId: string, input: AdminReviewInput) {
    const vendorObjectId = toObjectId(vendorId);
    const adminObjectId = toObjectId(adminUserId);

    const vendor = await Vendor.findById(vendorObjectId).select("userId").lean();

    if (!vendor) {
        throw new AppError("Vendor not found.", 404, "VENDOR_NOT_FOUND");
    }

    if (vendor.userId.equals(adminObjectId)) {
        throw new AppError("You cannot review your own vendor application.", 403, "SELF_REVIEW_FORBIDDEN");
    }

    const approved = input.decision === "approve";
    const reviewedAt = new Date();

    // The application, vendor and user role change together or not at all.
    // Transactions need a replica set (Atlas provides one).
    const session = await mongoose.startSession();

    try {
        return await session.withTransaction(async () => {
            // Only a SUBMITTED application can be reviewed; the status filter blocks concurrent reviews.
            const application = await VendorOnboarding.findOneAndUpdate(
                { vendorId: vendorObjectId, status: ONBOARDING_STATUSES.SUBMITTED },
                approved
                    ? { $set: { status: ONBOARDING_STATUSES.APPROVED, reviewedBy: adminObjectId, reviewedAt }, $unset: { rejectionReason: 1 } }
                    : { $set: { status: ONBOARDING_STATUSES.REJECTED, reviewedBy: adminObjectId, reviewedAt, rejectionReason: input.rejectionReason } },
                { returnDocument: "after", session },
            );

            if (!application) {
                throw new AppError("Submitted application not found.", 404, "SUBMITTED_APPLICATION_NOT_FOUND");
            }

            const updatedVendor = await Vendor.findByIdAndUpdate(
                vendorObjectId,
                approved
                    ? { $set: { status: VENDOR_STATUSES.ACTIVE, reviewedBy: adminObjectId, reviewedAt }, $unset: { rejectionReason: 1 } }
                    : { $set: { status: VENDOR_STATUSES.REJECTED, reviewedBy: adminObjectId, reviewedAt, rejectionReason: input.rejectionReason } },
                { returnDocument: "after", session },
            );

            if (!updatedVendor) {
                throw new AppError("Vendor not found.", 404, "VENDOR_NOT_FOUND");
            }

            if (approved) {
                const user = await User.findById(vendor.userId).select("role").session(session).lean();

                if (!user) {
                    throw new AppError("Vendor user account not found.", 404, "VENDOR_USER_NOT_FOUND");
                }

                // Only promote ordinary users; never demote an admin who also sells.
                // Rejection leaves the role unchanged.
                if (user.role === USER_ROLES.USER) {
                    await User.updateOne({ _id: vendor.userId, role: USER_ROLES.USER }, { $set: { role: USER_ROLES.VENDOR } }, { session });
                }
            }

            return { application, vendor: updatedVendor };
        });
    } finally {
        await session.endSession();
    }
}
