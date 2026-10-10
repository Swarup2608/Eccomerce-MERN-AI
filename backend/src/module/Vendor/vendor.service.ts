import mongoose, { Types } from "mongoose";
import { env } from "../../config/env.js";
import { AppError } from "../../errors/AppError.js";
import { cloudinaryResourceExists, createPrivateDownloadUrl, isCloudinaryConfigured } from "../../utils/cloudinary.js";
import { encryptString } from "../../utils/encryption.js";
import { escapeRegex, isDuplicateKeyError, toObjectId } from "../../utils/ids.js";
import { buildPagination, skipFor } from "../../utils/pagination.js";
import { User } from "../User/user.model.js";
import { USER_ROLES } from "../User/user.validation.js";
import { ONBOARDING_STATUSES, ONBOARDING_STEPS, VENDOR_ADDRESS_TYPES, VENDOR_DOCUMENT_STATUSES, VENDOR_STATUSES, type OnboardingStep } from "./vendor.constants.js";
import { Vendor } from "./vendor.model.js";
import { VendorAddress } from "./vendorAddress.model.js";
import { VendorBankAccount } from "./vendorBankAccount.model.js";
import { VendorDocument } from "./vendorDocument.model.js";
import { VendorOnboarding } from "./vendorOnboarding.model.js";
import { VendorStore } from "./vendorStore.model.js";
import type { AdminReviewInput, DocumentReviewInput, ListApplicationsQuery, ListVendorsQuery, VendorAddressInput, VendorAddressUpdateInput, VendorBankAccountInput, VendorBusinessInput, VendorCommissionInput, VendorDocumentInput, VendorStatusChangeInput, VendorStoreInput } from "./vendor.validation.js";

const STEP_ORDER: OnboardingStep[] = [
    ONBOARDING_STEPS.BUSINESS_DETAILS,
    ONBOARDING_STEPS.DOCUMENTS,
    ONBOARDING_STEPS.BANK_DETAILS,
    ONBOARDING_STEPS.ADDRESSES,
    ONBOARDING_STEPS.STORE_SETUP,
    ONBOARDING_STEPS.REVIEW,
];

export function vendorDocumentFolder(vendorId: Types.ObjectId | string): string {
    return `vendors/${vendorId.toString()}/documents`;
}

export function vendorStoreFolder(vendorId: Types.ObjectId | string): string {
    return `vendors/${vendorId.toString()}/store`;
}

export async function getOwnedVendor(userId: string) {
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

// Moves the wizard forward past `completed`, never backwards.
async function advanceStep(vendorId: Types.ObjectId, completed: OnboardingStep) {
    const nextStep = STEP_ORDER[Math.min(STEP_ORDER.indexOf(completed) + 1, STEP_ORDER.length - 1)]!;
    const earlierSteps = STEP_ORDER.slice(0, STEP_ORDER.indexOf(nextStep));

    await VendorOnboarding.updateOne(
        { vendorId, status: { $in: [ONBOARDING_STATUSES.IN_PROGRESS, ONBOARDING_STATUSES.REJECTED] }, currentStep: { $in: earlierSteps } },
        { $set: { currentStep: nextStep } },
    );
}

async function buildChecklist(vendorId: Types.ObjectId) {
    const [vendor, store, businessAddress, bankAccount, documentCount] = await Promise.all([
        Vendor.findById(vendorId).select("businessName businessType").lean(),
        VendorStore.exists({ vendorId }),
        VendorAddress.exists({ vendorId, type: VENDOR_ADDRESS_TYPES.BUSINESS }),
        VendorBankAccount.exists({ vendorId }),
        VendorDocument.countDocuments({ vendorId, status: { $ne: VENDOR_DOCUMENT_STATUSES.REJECTED } }),
    ]);

    return {
        businessDetails: Boolean(vendor?.businessName && vendor.businessType),
        documents: documentCount > 0,
        bankAccount: Boolean(bankAccount),
        businessAddress: Boolean(businessAddress),
        store: Boolean(store),
    };
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
    await VendorOnboarding.findOneAndUpdate(
        { vendorId: vendor._id },
        { $setOnInsert: { vendorId: vendor._id } },
        { upsert: true, returnDocument: "after" },
    );

    await advanceStep(vendor._id, ONBOARDING_STEPS.BUSINESS_DETAILS);

    return { vendor, application: await VendorOnboarding.findOne({ vendorId: vendor._id }).lean() };
}

export async function getMyOnboarding(userId: string) {
    const vendor = await getOwnedVendor(userId);

    // storageKey and the encrypted accountNumber are select: false, so they are not returned.
    const [application, store, addresses, documents, bankAccount, checklist] = await Promise.all([
        VendorOnboarding.findOne({ vendorId: vendor._id }).lean(),
        VendorStore.findOne({ vendorId: vendor._id }).lean(),
        VendorAddress.find({ vendorId: vendor._id }).sort({ createdAt: 1 }).lean(),
        VendorDocument.find({ vendorId: vendor._id }).sort({ createdAt: 1 }).lean(),
        VendorBankAccount.findOne({ vendorId: vendor._id }).lean(),
        buildChecklist(vendor._id),
    ]);

    return { vendor, application, store, addresses, documents, bankAccount, checklist };
}

export async function updateBusiness(userId: string, input: VendorBusinessInput) {
    const vendor = await getOwnedVendor(userId);
    await ensureEditable(vendor._id);

    vendor.businessName = input.businessName;
    vendor.businessType = input.businessType;
    await vendor.save();
    await advanceStep(vendor._id, ONBOARDING_STEPS.BUSINESS_DETAILS);

    return vendor;
}

// The storage key must be a private upload that this vendor's signed upload
// produced: inside its own folder and, when Cloudinary is configured, present there.
async function assertOwnedDocumentKey(vendorId: Types.ObjectId, storageKey: string) {
    const folder = `${vendorDocumentFolder(vendorId)}/`;

    if (!storageKey.startsWith(folder) || storageKey.includes("..") || storageKey.length <= folder.length) {
        throw new AppError("This document was not uploaded for your vendor account.", 400, "INVALID_STORAGE_KEY");
    }

    if (isCloudinaryConfigured()) {
        const exists = await cloudinaryResourceExists(storageKey, "authenticated");
        if (!exists) {
            throw new AppError("The uploaded document could not be found.", 400, "UPLOAD_NOT_FOUND");
        }
    } else if (env.NODE_ENV === "production") {
        throw new AppError("File uploads are not configured.", 503, "UPLOADS_NOT_CONFIGURED");
    }
}

export async function addDocument(userId: string, input: VendorDocumentInput) {
    const vendor = await getOwnedVendor(userId);
    await ensureEditable(vendor._id);
    await assertOwnedDocumentKey(vendor._id, input.storageKey);

    if (await VendorDocument.exists({ vendorId: vendor._id, storageKey: input.storageKey })) {
        throw new AppError("This document has already been added.", 409, "DOCUMENT_ALREADY_ADDED");
    }

    const document = await VendorDocument.create({ vendorId: vendor._id, ...input, status: VENDOR_DOCUMENT_STATUSES.PENDING });
    await advanceStep(vendor._id, ONBOARDING_STEPS.DOCUMENTS);

    const { storageKey: _storageKey, ...safeDocument } = document.toObject();
    return safeDocument;
}

export async function deleteDocument(userId: string, documentId: string) {
    const vendor = await getOwnedVendor(userId);
    await ensureEditable(vendor._id);

    // Verified documents are part of the review record and stay.
    const result = await VendorDocument.deleteOne({
        _id: toObjectId(documentId),
        vendorId: vendor._id,
        status: { $ne: VENDOR_DOCUMENT_STATUSES.VERIFIED },
    });

    if (result.deletedCount === 0) {
        throw new AppError("Document not found or already verified.", 404, "DOCUMENT_NOT_FOUND");
    }
}

export async function saveBankAccount(userId: string, input: VendorBankAccountInput) {
    const vendor = await getOwnedVendor(userId);
    await ensureEditable(vendor._id);

    // Changing bank details resets verification.
    const bankAccount = await VendorBankAccount.findOneAndUpdate(
        { vendorId: vendor._id },
        {
            $set: {
                accountHolderName: input.accountHolderName,
                accountNumber: encryptString(input.accountNumber),
                accountNumberLast4: input.accountNumber.slice(-4),
                ifscCode: input.ifscCode,
                bankName: input.bankName,
                isDefault: true,
                isVerified: false,
            },
            $unset: { verifiedBy: 1, verifiedAt: 1 },
            $setOnInsert: { vendorId: vendor._id },
        },
        { upsert: true, returnDocument: "after", runValidators: true },
    ).lean();

    await advanceStep(vendor._id, ONBOARDING_STEPS.BANK_DETAILS);

    return bankAccount;
}

export async function addAddress(userId: string, input: VendorAddressInput) {
    const vendor = await getOwnedVendor(userId);
    await ensureEditable(vendor._id);

    const count = await VendorAddress.countDocuments({ vendorId: vendor._id });
    if (count >= 10) {
        throw new AppError("You can save up to 10 addresses.", 400, "ADDRESS_LIMIT_REACHED");
    }

    const address = await VendorAddress.create({ vendorId: vendor._id, ...input, isDefault: false });

    if (input.type === VENDOR_ADDRESS_TYPES.BUSINESS) {
        await advanceStep(vendor._id, ONBOARDING_STEPS.ADDRESSES);
    }

    return address;
}

export async function updateAddress(userId: string, addressId: string, input: VendorAddressUpdateInput) {
    const vendor = await getOwnedVendor(userId);
    await ensureEditable(vendor._id);

    const address = await VendorAddress.findOneAndUpdate(
        { _id: toObjectId(addressId), vendorId: vendor._id },
        { $set: input },
        { returnDocument: "after", runValidators: true },
    ).lean();

    if (!address) {
        throw new AppError("Address not found.", 404, "ADDRESS_NOT_FOUND");
    }

    return address;
}

export async function deleteAddress(userId: string, addressId: string) {
    const vendor = await getOwnedVendor(userId);
    await ensureEditable(vendor._id);

    const result = await VendorAddress.deleteOne({ _id: toObjectId(addressId), vendorId: vendor._id });

    if (result.deletedCount === 0) {
        throw new AppError("Address not found.", 404, "ADDRESS_NOT_FOUND");
    }
}

export async function saveStore(userId: string, input: VendorStoreInput) {
    const vendor = await getOwnedVendor(userId);
    await ensureEditable(vendor._id);

    try {
        const store = await VendorStore.findOneAndUpdate(
            { vendorId: vendor._id },
            { $set: { ...input, isPublished: false }, $setOnInsert: { vendorId: vendor._id } },
            { upsert: true, returnDocument: "after", runValidators: true },
        ).lean();

        await advanceStep(vendor._id, ONBOARDING_STEPS.STORE_SETUP);

        return store;
    } catch (error) {
        if (isDuplicateKeyError(error, "slug")) {
            throw new AppError("This store slug is already in use.", 409, "STORE_SLUG_CONFLICT");
        }
        throw error;
    }
}

export async function submitOnboarding(userId: string) {
    const vendor = await getOwnedVendor(userId);

    if (vendor.status === VENDOR_STATUSES.SUSPENDED) {
        throw new AppError("Suspended vendors cannot submit an application.", 403, "VENDOR_SUSPENDED");
    }

    const checklist = await buildChecklist(vendor._id);

    if (!checklist.businessDetails) {
        throw new AppError("Business details are required.", 400, "BUSINESS_DETAILS_REQUIRED");
    }

    if (!checklist.store || !checklist.businessAddress || !checklist.bankAccount || !checklist.documents) {
        throw new AppError("Complete store, business address, bank and document details before submitting.", 400, "ONBOARDING_INCOMPLETE", checklist);
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

// ---------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------

export async function listApplications(query: ListApplicationsQuery) {
    const filter = { status: query.status };
    const [applications, total] = await Promise.all([
        VendorOnboarding.find(filter)
            .sort(query.status === ONBOARDING_STATUSES.SUBMITTED ? { submittedAt: 1 } : { updatedAt: -1 })
            .skip(skipFor(query.page, query.limit))
            .limit(query.limit)
            .populate("vendorId", "userId businessName businessType status")
            .lean(),
        VendorOnboarding.countDocuments(filter),
    ]);

    return { applications, pagination: buildPagination(query.page, query.limit, total) };
}

export async function getVendorDetail(vendorId: string) {
    const vendorObjectId = toObjectId(vendorId);
    const vendor = await Vendor.findById(vendorObjectId).lean();

    if (!vendor) {
        throw new AppError("Vendor not found.", 404, "VENDOR_NOT_FOUND");
    }

    const [owner, application, store, addresses, documents, bankAccount, checklist] = await Promise.all([
        User.findById(vendor.userId).select("firstName lastName email userName phoneNumber role status emailVerified createdAt").lean(),
        VendorOnboarding.findOne({ vendorId: vendorObjectId }).lean(),
        VendorStore.findOne({ vendorId: vendorObjectId }).lean(),
        VendorAddress.find({ vendorId: vendorObjectId }).sort({ createdAt: 1 }).lean(),
        VendorDocument.find({ vendorId: vendorObjectId }).sort({ createdAt: 1 }).lean(),
        VendorBankAccount.findOne({ vendorId: vendorObjectId }).lean(),
        buildChecklist(vendorObjectId),
    ]);

    return {
        vendor: { ...vendor, effectiveCommissionPercent: vendor.commissionPercent ?? env.PLATFORM_COMMISSION_PERCENT },
        owner,
        application,
        store,
        addresses,
        documents,
        bankAccount,
        checklist,
    };
}

export async function getDocumentDownloadUrl(vendorId: string, documentId: string) {
    const document = await VendorDocument.findOne({ _id: toObjectId(documentId), vendorId: toObjectId(vendorId) }).select("+storageKey mimeType originalFileName").lean();

    if (!document) {
        throw new AppError("Document not found.", 404, "DOCUMENT_NOT_FOUND");
    }

    const expiresInSeconds = 300;

    return {
        url: createPrivateDownloadUrl(document.storageKey, document.mimeType, expiresInSeconds),
        fileName: document.originalFileName,
        expiresAt: new Date(Date.now() + expiresInSeconds * 1000),
    };
}

export async function reviewDocument(vendorId: string, documentId: string, reviewerId: string, input: DocumentReviewInput) {
    const document = await VendorDocument.findOneAndUpdate(
        { _id: toObjectId(documentId), vendorId: toObjectId(vendorId) },
        input.status === "verified"
            ? { $set: { status: VENDOR_DOCUMENT_STATUSES.VERIFIED, reviewedBy: reviewerId, reviewedAt: new Date() }, $unset: { rejectionReason: 1 } }
            : { $set: { status: VENDOR_DOCUMENT_STATUSES.REJECTED, reviewedBy: reviewerId, reviewedAt: new Date(), rejectionReason: input.rejectionReason } },
        { returnDocument: "after" },
    ).lean();

    if (!document) {
        throw new AppError("Document not found.", 404, "DOCUMENT_NOT_FOUND");
    }

    return document;
}

// reviewerId is an actor ID: a user ObjectId string, or the Super Admin sentinel,
// which is not an ObjectId and must not be converted to one.
export async function reviewApplication(vendorId: string, reviewerId: string, input: AdminReviewInput) {
    const vendorObjectId = toObjectId(vendorId);

    const vendor = await Vendor.findById(vendorObjectId).select("userId").lean();

    if (!vendor) {
        throw new AppError("Vendor not found.", 404, "VENDOR_NOT_FOUND");
    }

    if (vendor.userId.toString() === reviewerId) {
        throw new AppError("You cannot review your own vendor application.", 403, "SELF_REVIEW_FORBIDDEN");
    }

    const approved = input.decision === "approve";
    const reviewedAt = new Date();

    if (approved) {
        const checklist = await buildChecklist(vendorObjectId);
        if (!Object.values(checklist).every(Boolean)) {
            throw new AppError("This application is incomplete and cannot be approved.", 409, "ONBOARDING_INCOMPLETE", checklist);
        }
    }

    // The application, vendor, documents, bank, store and user role change together
    // or not at all. Transactions need a replica set (Atlas provides one).
    const session = await mongoose.startSession();

    try {
        return await session.withTransaction(async () => {
            // Only a SUBMITTED application can be reviewed; the status filter blocks concurrent reviews.
            const application = await VendorOnboarding.findOneAndUpdate(
                { vendorId: vendorObjectId, status: ONBOARDING_STATUSES.SUBMITTED },
                approved
                    ? { $set: { status: ONBOARDING_STATUSES.APPROVED, reviewedBy: reviewerId, reviewedAt }, $unset: { rejectionReason: 1 } }
                    : { $set: { status: ONBOARDING_STATUSES.REJECTED, reviewedBy: reviewerId, reviewedAt, rejectionReason: input.rejectionReason } },
                { returnDocument: "after", session },
            );

            if (!application) {
                throw new AppError("Submitted application not found.", 404, "SUBMITTED_APPLICATION_NOT_FOUND");
            }

            const updatedVendor = await Vendor.findByIdAndUpdate(
                vendorObjectId,
                approved
                    ? { $set: { status: VENDOR_STATUSES.ACTIVE, reviewedBy: reviewerId, reviewedAt }, $unset: { rejectionReason: 1 } }
                    : { $set: { status: VENDOR_STATUSES.REJECTED, reviewedBy: reviewerId, reviewedAt, rejectionReason: input.rejectionReason } },
                { returnDocument: "after", session },
            );

            if (!updatedVendor) {
                throw new AppError("Vendor not found.", 404, "VENDOR_NOT_FOUND");
            }

            if (approved) {
                // Approval accepts every document still pending and the payout account,
                // and publishes the store.
                await VendorDocument.updateMany(
                    { vendorId: vendorObjectId, status: VENDOR_DOCUMENT_STATUSES.PENDING },
                    { $set: { status: VENDOR_DOCUMENT_STATUSES.VERIFIED, reviewedBy: reviewerId, reviewedAt } },
                    { session },
                );
                await VendorBankAccount.updateOne({ vendorId: vendorObjectId }, { $set: { isVerified: true, verifiedBy: reviewerId, verifiedAt: reviewedAt } }, { session });
                await VendorStore.updateOne({ vendorId: vendorObjectId }, { $set: { isPublished: true } }, { session });

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

export async function listVendors(query: ListVendorsQuery) {
    const filter: Record<string, unknown> = {};

    if (query.status) {
        filter.status = query.status;
    }
    if (query.search) {
        filter.businessName = { $regex: escapeRegex(query.search), $options: "i" };
    }

    const [vendors, total] = await Promise.all([
        Vendor.find(filter).sort({ createdAt: -1 }).skip(skipFor(query.page, query.limit)).limit(query.limit).lean(),
        Vendor.countDocuments(filter),
    ]);

    const stores = await VendorStore.find({ vendorId: { $in: vendors.map((vendor) => vendor._id) } }).select("vendorId name slug isPublished").lean();
    const storeByVendor = new Map(stores.map((store) => [store.vendorId.toString(), store]));

    return {
        vendors: vendors.map((vendor) => ({ ...vendor, store: storeByVendor.get(vendor._id.toString()) ?? null })),
        pagination: buildPagination(query.page, query.limit, total),
    };
}

export async function changeVendorStatus(vendorId: string, reviewerId: string, input: VendorStatusChangeInput) {
    const vendorObjectId = toObjectId(vendorId);
    const suspend = input.action === "suspend";

    const vendor = await Vendor.findOneAndUpdate(
        { _id: vendorObjectId, status: suspend ? VENDOR_STATUSES.ACTIVE : VENDOR_STATUSES.SUSPENDED },
        suspend
            ? { $set: { status: VENDOR_STATUSES.SUSPENDED, suspensionReason: input.reason, reviewedBy: reviewerId, reviewedAt: new Date() } }
            : { $set: { status: VENDOR_STATUSES.ACTIVE, reviewedBy: reviewerId, reviewedAt: new Date() }, $unset: { suspensionReason: 1 } },
        { returnDocument: "after" },
    ).lean();

    if (!vendor) {
        throw new AppError(suspend ? "Only active vendors can be suspended." : "Only suspended vendors can be reactivated.", 409, "INVALID_VENDOR_STATUS");
    }

    // Suspended stores disappear from the storefront; their listings are filtered
    // out by vendor status in catalog queries.
    await VendorStore.updateOne({ vendorId: vendorObjectId }, { $set: { isPublished: !suspend } });

    return vendor;
}

export async function setVendorCommission(vendorId: string, input: VendorCommissionInput) {
    const vendor = await Vendor.findByIdAndUpdate(
        toObjectId(vendorId),
        input.commissionPercent === null ? { $unset: { commissionPercent: 1 } } : { $set: { commissionPercent: input.commissionPercent } },
        { returnDocument: "after" },
    ).lean();

    if (!vendor) {
        throw new AppError("Vendor not found.", 404, "VENDOR_NOT_FOUND");
    }

    return { ...vendor, effectiveCommissionPercent: vendor.commissionPercent ?? env.PLATFORM_COMMISSION_PERCENT };
}
