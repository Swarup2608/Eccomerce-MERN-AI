import assert from "node:assert/strict";
import { USER_ROLES } from "../../modules/users/user.validation.js";
import { User } from "../../modules/users/user.model.js";
import { hashPassword } from "../../utils/password.js";
import { Client, type TestApp } from "./harness.js";

export const PASSWORD = "Str0ng&Unusual1";

let counter = 0;
export const unique = (prefix: string): string => `${prefix}${(counter += 1)}${Date.now().toString(36)}`;

// A verified, signed-in storefront customer.
export async function signedInCustomer(app: TestApp): Promise<{ client: Client; email: string; id: string }> {
  const client = new Client(app.baseUrl);
  const userName = unique("shopper");
  const email = `${userName}@example.com`;
  assert.equal((await client.post("/api/v1/auth/register", { firstName: "Shop", lastName: "Per", email, userName, password: PASSWORD })).status, 202);
  assert.equal((await client.post("/api/v1/auth/verify-email", { token: app.mailer.tokenFor(email) })).status, 204);
  const login = await client.post("/api/v1/auth/login", { identifier: email, password: PASSWORD });
  assert.equal(login.status, 200);
  return { client, email, id: login.body.user.id };
}

// A signed-in admin (password step, then the emailed code).
export async function signedInAdmin(app: TestApp): Promise<{ client: Client; email: string; id: string }> {
  const email = `${unique("admin")}@example.com`;
  const doc = await User.create({ firstName: "Ad", lastName: "Min", email, userName: unique("root"), passwordHash: await hashPassword(PASSWORD), role: USER_ROLES.ADMIN, emailVerified: true });
  const client = new Client(app.baseUrl);
  const first = await client.post("/api/v1/admin/auth/login", { email, password: PASSWORD });
  assert.equal(first.status, 202);
  const code = /\b(\d{6})\b/.exec(app.mailer.last(email)?.text ?? "")?.[1];
  assert.ok(code, "code was emailed");
  assert.equal((await client.post("/api/v1/admin/auth/login/verify", { challengeId: first.body.challengeId, code })).status, 200);
  return { client, email, id: doc._id.toString() };
}

// Minimal valid image bytes for each type, enough to pass the file-signature check.
export const PNG_BYTES = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);

// Presigns an upload as the admin and "uploads" the bytes to the in-memory bucket.
export async function uploadImage(app: TestApp, admin: Client, bytes: Uint8Array = PNG_BYTES, contentType = "image/png"): Promise<string> {
  const res = await admin.post("/api/v1/admin/uploads/images", { contentType, size: bytes.byteLength });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  app.storage.put(res.body.upload.key, bytes, contentType);
  return res.body.upload.key as string;
}

export interface SeededCatalog {
  rootId: string;
  leafId: string;
  leafSlug: string;
  rootSlug: string;
}

// Clothing > T-Shirts: size and colour vary per variant, material is a required product attribute.
export async function seedClothing(admin: Client): Promise<SeededCatalog> {
  const rootSlug = unique("clothing");
  const root = await admin.post("/api/v1/admin/categories", {
    name: "Clothing",
    slug: rootSlug,
    attributes: [
      { key: "size", label: "Size", type: "select", options: ["S", "M", "L"], variantAxis: true, filterable: true, required: true },
      { key: "color", label: "Colour", type: "select", options: ["Black", "White", "Red"], variantAxis: true, filterable: true, required: true },
      { key: "material", label: "Material", type: "select", options: ["Cotton", "Linen"], filterable: true, required: true },
    ],
  });
  assert.equal(root.status, 201, JSON.stringify(root.body));
  const leafSlug = unique("tees");
  const leaf = await admin.post("/api/v1/admin/categories", { name: "T-Shirts", slug: leafSlug, parentId: root.body.category.id, attributes: [{ key: "neck", label: "Neck", type: "select", options: ["Crew", "V-neck"], filterable: true }] });
  assert.equal(leaf.status, 201, JSON.stringify(leaf.body));
  return { rootId: root.body.category.id, leafId: leaf.body.category.id, leafSlug, rootSlug };
}

let skuCounter = 0;
export const sku = (): string => `SKU-${(skuCounter += 1)}-${Date.now().toString(36).toUpperCase()}`;

// An active T-shirt with one variant per option combination given.
export async function createTee(admin: Client, categoryId: string, overrides: Record<string, unknown> = {}, variants?: Record<string, unknown>[]) {
  const res = await admin.post("/api/v1/admin/products", {
    title: unique("Tee "),
    brand: "Northline",
    categoryId,
    attributes: { material: "Cotton", neck: "Crew" },
    variants: variants ?? [
      { sku: sku(), options: { size: "M", color: "Black" }, price: 59900, stock: 10 },
      { sku: sku(), options: { size: "L", color: "White" }, price: 69900, stock: 3 },
    ],
    status: "active",
    ...overrides,
  });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return res.body.product;
}
