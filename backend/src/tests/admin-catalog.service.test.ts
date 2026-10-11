import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { after, before, beforeEach } from "node:test";
import mongoose from "mongoose";

import { AppError } from "../errors/AppError.js";
import { updateUserRole, updateUserStatus } from "../module/Admin/admin.service.js";
import { CategoryModel } from "../module/Category/category.model.js";
import { deleteCategory } from "../module/Category/category.service.js";
import { Product } from "../module/Product/product.model.js";
import { ProductVariant } from "../module/Product/productVariant.model.js";
import { createProduct, createProductVariant, deleteProductVariant, getProductForAdmin, updateProductVariant } from "../module/Product/product.service.js";
import { SUPER_ADMIN_IDENTITY_ID } from "../module/User/super-admin.constants.js";
import { User } from "../module/User/user.model.js";
import type { AuthenticatedActor } from "../utils/actor.js";

const mongoTestUri = process.env.MONGO_TEST_URI;
const superAdmin: AuthenticatedActor = { userId: SUPER_ADMIN_IDENTITY_ID, sessionId: "s", role: "super_admin" };

async function clearCollections() {
  await Promise.all([User.deleteMany({}), CategoryModel.deleteMany({}), Product.deleteMany({}), ProductVariant.deleteMany({})]);
}

before(async () => {
  assert.ok(mongoTestUri, "MONGO_TEST_URI must be configured in backend/.env");
  await mongoose.connect(mongoTestUri);
  await Promise.all([User.init(), CategoryModel.init(), Product.init(), ProductVariant.init()]);
});

beforeEach(clearCollections);

after(async () => {
  await clearCollections();
  await mongoose.disconnect();
});

async function createUser(role: "user" | "admin" | "vendor" = "user") {
  return User.create({
    firstName: "Test",
    lastName: "User",
    email: `${randomUUID()}@example.com`,
    userName: `u_${randomUUID().replaceAll("-", "").slice(0, 20)}`,
    passwordHash: "unused",
    role,
    emailVerified: true,
    phoneVerified: false,
  });
}

function adminActor(userId: string): AuthenticatedActor {
  return { userId, sessionId: "s", role: "admin" };
}

function isAppError(code: string) {
  return (error: unknown) => error instanceof AppError && error.code === code;
}

test("admins can suspend customers but not other admins", async () => {
  const admin = await createUser("admin");
  const otherAdmin = await createUser("admin");
  const customer = await createUser();

  const updated = await updateUserStatus(adminActor(admin._id.toString()), customer._id.toString(), { status: "suspended" });
  assert.equal(updated?.status, "suspended");

  await assert.rejects(updateUserStatus(adminActor(admin._id.toString()), otherAdmin._id.toString(), { status: "suspended" }), isAppError("FORBIDDEN"));
  await assert.rejects(updateUserStatus(adminActor(admin._id.toString()), admin._id.toString(), { status: "inactive" }), isAppError("SELF_MODIFICATION_FORBIDDEN"));

  const bySuperAdmin = await updateUserStatus(superAdmin, otherAdmin._id.toString(), { status: "suspended" });
  assert.equal(bySuperAdmin?.status, "suspended");
});

test("the Super Admin can grant staff roles but not change a vendor's role", async () => {
  const customer = await createUser();
  const vendor = await createUser("vendor");

  const promoted = await updateUserRole(superAdmin, customer._id.toString(), { role: "vendor_onboarding_reviewer" });
  assert.equal(promoted?.role, "vendor_onboarding_reviewer");

  await assert.rejects(updateUserRole(superAdmin, vendor._id.toString(), { role: "admin" }), isAppError("VENDOR_ROLE_MANAGED"));
});

async function createCategory() {
  return CategoryModel.create({ name: "Footwear", slug: `footwear-${randomUUID().slice(0, 8)}` });
}

test("new products get a default variant automatically", async () => {
  const category = await createCategory();
  const product = await createProduct({
    name: "Runner",
    slug: `runner-${randomUUID().slice(0, 8)}`,
    description: "A running shoe.",
    categoryId: category._id.toString(),
    images: [],
    attributes: {},
    status: "draft",
  });

  const { variants } = await getProductForAdmin(product._id.toString());

  assert.equal(variants.length, 1);
  assert.equal(variants[0]?.isDefault, true);
});

test("variants with duplicate attributes are rejected and the default moves when set", async () => {
  const category = await createCategory();
  const product = await createProduct({
    name: "Tee",
    slug: `tee-${randomUUID().slice(0, 8)}`,
    description: "A t-shirt.",
    categoryId: category._id.toString(),
    images: [],
    attributes: {},
    status: "draft",
    variants: [{ attributes: { Size: "M" } }, { attributes: { Size: "L" } }],
  });
  const productId = product._id.toString();

  await assert.rejects(createProductVariant(productId, { attributes: { size: "m" }, isDefault: false }), isAppError("DUPLICATE_VARIANT"));

  const large = await ProductVariant.findOne({ productId: product._id, variantKey: "size:l" }).lean();
  await updateProductVariant(productId, large!._id.toString(), { isDefault: true });

  const defaults = await ProductVariant.find({ productId: product._id, isDefault: true }).lean();
  assert.equal(defaults.length, 1);
  assert.equal(defaults[0]?._id.toString(), large!._id.toString());
});

test("deleting the default variant promotes another, and the last variant cannot be deleted", async () => {
  const category = await createCategory();
  const product = await createProduct({
    name: "Cap",
    slug: `cap-${randomUUID().slice(0, 8)}`,
    description: "A cap.",
    categoryId: category._id.toString(),
    images: [],
    attributes: {},
    status: "draft",
    variants: [{ attributes: { Colour: "Red" } }, { attributes: { Colour: "Blue" } }],
  });
  const productId = product._id.toString();
  const red = await ProductVariant.findOne({ productId: product._id, isDefault: true }).lean();

  await deleteProductVariant(productId, red!._id.toString());

  const remaining = await ProductVariant.find({ productId: product._id }).lean();
  assert.equal(remaining.length, 1);
  assert.equal(remaining[0]?.isDefault, true);

  await assert.rejects(deleteProductVariant(productId, remaining[0]!._id.toString()), isAppError("LAST_VARIANT"));
});

test("categories with products cannot be deleted", async () => {
  const category = await createCategory();
  await createProduct({ name: "Boot", slug: `boot-${randomUUID().slice(0, 8)}`, description: "A boot.", categoryId: category._id.toString(), images: [], attributes: {}, status: "draft" });

  await assert.rejects(deleteCategory(category._id.toString()), isAppError("CATEGORY_IN_USE"));
});
