import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { after, before, beforeEach } from "node:test";
import mongoose from "mongoose";

import { AppError } from "../errors/AppError.js";
import { SUPER_ADMIN_IDENTITY_ID } from "../module/User/super-admin.constants.js";
import { User } from "../module/User/user.model.js";
import { Vendor } from "../module/Vendor/vendor.model.js";
import { VendorAddress } from "../module/Vendor/vendorAddress.model.js";
import { VendorBankAccount } from "../module/Vendor/vendorBankAccount.model.js";
import { VendorDocument } from "../module/Vendor/vendorDocument.model.js";
import { VendorOnboarding } from "../module/Vendor/vendorOnboarding.model.js";
import { VendorStore } from "../module/Vendor/vendorStore.model.js";
import { addAddress, addDocument, changeVendorStatus, deleteDocument, getMyOnboarding, reviewApplication, reviewDocument, saveBankAccount, saveStore, startOnboarding, submitOnboarding, vendorDocumentFolder } from "../module/Vendor/vendor.service.js";
import { decryptString } from "../utils/encryption.js";

const mongoTestUri = process.env.MONGO_TEST_URI;
async function clearCollections() {
  await Promise.all([
    User.deleteMany({}),
    Vendor.deleteMany({}),
    VendorAddress.deleteMany({}),
    VendorBankAccount.deleteMany({}),
    VendorDocument.deleteMany({}),
    VendorOnboarding.deleteMany({}),
    VendorStore.deleteMany({}),
  ]);
}

before(async () => {
  assert.ok(mongoTestUri, "MONGO_TEST_URI must be configured in backend/.env");
  await mongoose.connect(mongoTestUri);
  // Unique indexes must exist before the tests rely on them.
  await Promise.all([User.init(), Vendor.init(), VendorBankAccount.init(), VendorOnboarding.init(), VendorStore.init()]);
});

beforeEach(clearCollections);

after(async () => {
  await clearCollections();
  await mongoose.disconnect();
});

async function createUser() {
  return User.create({
    firstName: "Vendor",
    lastName: "Owner",
    email: `${randomUUID()}@example.com`,
    userName: `v_${randomUUID().replaceAll("-", "").slice(0, 20)}`,
    passwordHash: "unused",
    emailVerified: true,
    phoneVerified: false,
  });
}

const businessAddress = {
  type: "business" as const,
  recipientName: "Vendor Owner",
  phone: "+919876543210",
  addressLine1: "12 Market Road",
  city: "Hyderabad",
  state: "Telangana",
  postalCode: "500001",
  country: "India",
};

async function completeApplication(userId: string) {
  const { vendor } = await startOnboarding(userId, { businessName: "Acme Traders", businessType: "sole_proprietorship" });
  await addDocument(userId, {
    type: "government_id",
    storageKey: `${vendorDocumentFolder(vendor._id)}/id-card`,
    originalFileName: "id.pdf",
    mimeType: "application/pdf",
  });
  await saveBankAccount(userId, { accountHolderName: "Vendor Owner", accountNumber: "123456789012", ifscCode: "HDFC0001234", bankName: "HDFC" });
  await addAddress(userId, businessAddress);
  await saveStore(userId, { name: "Acme Store", slug: `acme-${randomUUID().slice(0, 8)}` });
  return vendor;
}

test("the wizard step advances as each section is completed", async () => {
  const user = await createUser();
  const userId = user._id.toString();

  const { application } = await startOnboarding(userId, { businessName: "Acme", businessType: "individual" });
  assert.equal(application?.currentStep, "documents");

  await completeApplication(userId);
  const onboarding = await getMyOnboarding(userId);

  assert.equal(onboarding.application?.currentStep, "review");
  assert.deepEqual(onboarding.checklist, { businessDetails: true, documents: true, bankAccount: true, businessAddress: true, store: true });
});

test("bank account numbers are encrypted at rest and only the last 4 are exposed", async () => {
  const user = await createUser();
  await startOnboarding(user._id.toString(), { businessName: "Acme", businessType: "individual" });

  const saved = await saveBankAccount(user._id.toString(), { accountHolderName: "Owner", accountNumber: "998877665544", ifscCode: "SBIN0000001", bankName: "SBI" });
  const stored = await VendorBankAccount.findById(saved?._id).select("+accountNumber").lean();

  assert.equal(saved?.accountNumberLast4, "5544");
  assert.equal((saved as unknown as Record<string, unknown>).accountNumber, undefined);
  assert.notEqual(stored?.accountNumber, "998877665544");
  assert.equal(decryptString(stored!.accountNumber), "998877665544");
});

test("documents must live in the vendor's own upload folder", async () => {
  const owner = await createUser();
  const other = await createUser();
  await startOnboarding(owner._id.toString(), { businessName: "Owner Co", businessType: "individual" });
  const { vendor: otherVendor } = await startOnboarding(other._id.toString(), { businessName: "Other Co", businessType: "individual" });

  await assert.rejects(
    addDocument(owner._id.toString(), {
      type: "government_id",
      storageKey: `${vendorDocumentFolder(otherVendor._id)}/stolen`,
      originalFileName: "id.pdf",
      mimeType: "application/pdf",
    }),
    (error: unknown) => error instanceof AppError && error.code === "INVALID_STORAGE_KEY",
  );
});

test("submitting an incomplete application lists what is missing", async () => {
  const user = await createUser();
  await startOnboarding(user._id.toString(), { businessName: "Acme", businessType: "individual" });

  await assert.rejects(submitOnboarding(user._id.toString()), (error: unknown) => {
    assert.ok(error instanceof AppError);
    assert.equal(error.code, "ONBOARDING_INCOMPLETE");
    assert.deepEqual(error.details, { businessDetails: true, documents: false, bankAccount: false, businessAddress: false, store: false });
    return true;
  });
});

test("the Super Admin can approve an application, which publishes the store and promotes the user", async () => {
  const user = await createUser();
  const userId = user._id.toString();
  const vendor = await completeApplication(userId);
  await submitOnboarding(userId);

  const result = await reviewApplication(vendor._id.toString(), SUPER_ADMIN_IDENTITY_ID, { decision: "approve" });

  const [updatedUser, store, bank, documents] = await Promise.all([
    User.findById(user._id).lean(),
    VendorStore.findOne({ vendorId: vendor._id }).lean(),
    VendorBankAccount.findOne({ vendorId: vendor._id }).lean(),
    VendorDocument.find({ vendorId: vendor._id }).lean(),
  ]);

  assert.equal(result.application.status, "approved");
  assert.equal(result.application.reviewedBy, SUPER_ADMIN_IDENTITY_ID);
  assert.equal(result.vendor.status, "active");
  assert.equal(updatedUser?.role, "vendor");
  assert.equal(store?.isPublished, true);
  assert.equal(bank?.isVerified, true);
  assert.ok(documents.every((document) => document.status === "verified"));
});

test("a rejected application can be corrected and resubmitted", async () => {
  const user = await createUser();
  const userId = user._id.toString();
  const vendor = await completeApplication(userId);
  await submitOnboarding(userId);

  await reviewApplication(vendor._id.toString(), SUPER_ADMIN_IDENTITY_ID, { decision: "reject", rejectionReason: "ID document is unreadable." });
  assert.equal((await Vendor.findById(vendor._id).lean())?.status, "rejected");

  const resubmitted = await submitOnboarding(userId);

  assert.equal(resubmitted.status, "submitted");
  assert.equal((await Vendor.findById(vendor._id).lean())?.status, "pending");
});

test("vendors cannot review their own application", async () => {
  const user = await createUser();
  const userId = user._id.toString();
  const vendor = await completeApplication(userId);
  await submitOnboarding(userId);

  await assert.rejects(
    reviewApplication(vendor._id.toString(), userId, { decision: "approve" }),
    (error: unknown) => error instanceof AppError && error.code === "SELF_REVIEW_FORBIDDEN",
  );
});

test("verified documents cannot be deleted by the applicant", async () => {
  const user = await createUser();
  const userId = user._id.toString();
  const vendor = await completeApplication(userId);
  const document = await VendorDocument.findOne({ vendorId: vendor._id }).lean();

  await reviewDocument(vendor._id.toString(), document!._id.toString(), SUPER_ADMIN_IDENTITY_ID, { status: "verified" });

  await assert.rejects(
    deleteDocument(userId, document!._id.toString()),
    (error: unknown) => error instanceof AppError && error.code === "DOCUMENT_NOT_FOUND",
  );
});

test("suspending an active vendor unpublishes its store and reactivating restores it", async () => {
  const user = await createUser();
  const userId = user._id.toString();
  const vendor = await completeApplication(userId);
  await submitOnboarding(userId);
  await reviewApplication(vendor._id.toString(), SUPER_ADMIN_IDENTITY_ID, { decision: "approve" });

  await changeVendorStatus(vendor._id.toString(), SUPER_ADMIN_IDENTITY_ID, { action: "suspend", reason: "Policy violation" });
  assert.equal((await VendorStore.findOne({ vendorId: vendor._id }).lean())?.isPublished, false);

  await changeVendorStatus(vendor._id.toString(), SUPER_ADMIN_IDENTITY_ID, { action: "reactivate" });
  assert.equal((await VendorStore.findOne({ vendorId: vendor._id }).lean())?.isPublished, true);

  await assert.rejects(
    changeVendorStatus(vendor._id.toString(), SUPER_ADMIN_IDENTITY_ID, { action: "reactivate" }),
    (error: unknown) => error instanceof AppError && error.code === "INVALID_VENDOR_STATUS",
  );
});
