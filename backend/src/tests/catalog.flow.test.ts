import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { Product } from "../modules/products/product.model.js";
import { matchesSignature } from "../modules/uploads/upload.service.js";
import { PNG_BYTES, createTee, seedClothing, signedInAdmin, signedInCustomer, sku, unique, uploadImage } from "./helpers/actors.js";
import { Client, hasInfra, startApp, startInfra, type Infra, type TestApp } from "./helpers/harness.js";

const suite = hasInfra() ? describe : describe.skip;

let infra: Infra;
let app: TestApp;
let admin: Client;

before(async () => {
  if (!hasInfra()) return;
  infra = await startInfra();
  app = await startApp(infra.redis);
  admin = (await signedInAdmin(app)).client;
});

after(async () => {
  if (!hasInfra()) return;
  await app.stop();
  await infra.stop();
});

suite("admin access control", () => {
  it("refuses catalog management without an admin session", async () => {
    const anonymous = new Client(app.baseUrl);
    assert.equal((await anonymous.get("/api/v1/admin/products")).status, 401);
    assert.equal((await anonymous.post("/api/v1/admin/categories", { name: "X" })).status, 401);

    // A customer session cookie is scoped to the storefront and signed with the other secret: it never passes as admin.
    const { client: customer } = await signedInCustomer(app);
    const token = customer.cookie("sf_access");
    assert.ok(token);
    customer.setCookie("adm_access", token, "/api/v1/admin");
    assert.equal((await customer.get("/api/v1/admin/products")).status, 401);
    assert.equal((await customer.post("/api/v1/admin/uploads/images", { contentType: "image/png", size: 10 })).status, 401);
  });
});

suite("categories", () => {
  it("inherits attributes from parents and refuses redefining them", async () => {
    const { leafId, rootId } = await seedClothing(admin);
    const leaf = await admin.get(`/api/v1/admin/categories/${leafId}`);
    assert.equal(leaf.status, 200);
    assert.deepEqual(leaf.body.category.effectiveAttributes.map((def: { key: string }) => def.key), ["size", "color", "material", "neck"]);

    const clash = await admin.post("/api/v1/admin/categories", { name: "Shirts", parentId: rootId, attributes: [{ key: "size", label: "Size", type: "text" }] });
    assert.equal(clash.status, 422);
    assert.equal(clash.body.error.code, "ATTRIBUTE_CONFLICT");

    const badDef = await admin.post("/api/v1/admin/categories", { name: "Bad", attributes: [{ key: "fit", label: "Fit", type: "text", variantAxis: true }] });
    assert.equal(badDef.status, 400);
  });

  it("refuses cycles and deleting categories that are in use", async () => {
    const { leafId, rootId } = await seedClothing(admin);
    const cycle = await admin.patch(`/api/v1/admin/categories/${rootId}`, { parentId: leafId });
    assert.equal(cycle.status, 422);
    assert.equal(cycle.body.error.code, "INVALID_PARENT");

    assert.equal((await admin.delete(`/api/v1/admin/categories/${rootId}`)).body.error.code, "CATEGORY_HAS_CHILDREN");
    await createTee(admin, leafId);
    assert.equal((await admin.delete(`/api/v1/admin/categories/${leafId}`)).body.error.code, "CATEGORY_HAS_PRODUCTS");
  });

  it("moves products along when a category is re-parented", async () => {
    const first = await seedClothing(admin);
    const second = await seedClothing(admin);
    const product = await createTee(admin, first.leafId);
    // Same attribute keys in both trees, so the move is allowed.
    assert.equal((await admin.patch(`/api/v1/admin/categories/${first.leafId}`, { parentId: second.rootId })).status, 200);
    const doc = await Product.findById(product.id).lean();
    assert.deepEqual(doc?.categoryPath.map(String), [second.rootId, first.leafId]);
    const listed = await new Client(app.baseUrl).get(`/api/v1/products?category=${second.rootSlug}`);
    assert.equal(listed.body.total, 1);
  });
});

suite("products", () => {
  it("validates attributes and variant options against the category", async () => {
    const { leafId } = await seedClothing(admin);
    const base = { title: "Tee", categoryId: leafId, status: "active" };

    const missing = await admin.post("/api/v1/admin/products", { ...base, attributes: {}, variants: [{ sku: sku(), options: { size: "M", color: "Black" }, price: 100, stock: 1 }] });
    assert.equal(missing.status, 400);
    assert.ok(missing.body.error.details.some((detail: { path: string }) => detail.path === "attributes.material"));

    const unknownKey = await admin.post("/api/v1/admin/products", { ...base, attributes: { material: "Cotton", gsm: 180 }, variants: [{ sku: sku(), options: { size: "M", color: "Black" }, price: 100, stock: 1 }] });
    assert.equal(unknownKey.status, 400);

    const badOption = await admin.post("/api/v1/admin/products", { ...base, attributes: { material: "Cotton" }, variants: [{ sku: sku(), options: { size: "XXL", color: "Black" }, price: 100, stock: 1 }] });
    assert.equal(badOption.status, 400);
    assert.equal(badOption.body.error.details[0].path, "variants.0.options.size");

    const duplicateCombo = await admin.post("/api/v1/admin/products", {
      ...base,
      attributes: { material: "Cotton" },
      variants: [
        { sku: sku(), options: { size: "M", color: "Black" }, price: 100, stock: 1 },
        { sku: sku(), options: { size: "M", color: "Black" }, price: 100, stock: 1 },
      ],
    });
    assert.equal(duplicateCombo.status, 400);

    const badCompare = await admin.post("/api/v1/admin/products", { ...base, attributes: { material: "Cotton" }, variants: [{ sku: sku(), options: { size: "M", color: "Black" }, price: 500, compareAtPrice: 400, stock: 1 }] });
    assert.equal(badCompare.status, 400);
  });

  it("denormalises prices, stock and facets, and keeps SKUs unique", async () => {
    const { leafId } = await seedClothing(admin);
    const product = await createTee(admin, leafId);
    assert.equal(product.minPrice, 59900);
    assert.equal(product.maxPrice, 69900);
    assert.equal(product.totalStock, 13);

    const doc = await Product.findById(product.id).lean();
    assert.deepEqual(new Set(doc?.facets), new Set(["brand:Northline", "size:M", "size:L", "color:Black", "color:White", "material:Cotton", "neck:Crew"]));

    const reused = await admin.post("/api/v1/admin/products", { title: "Other", categoryId: leafId, attributes: { material: "Cotton" }, variants: [{ sku: product.variants[0].sku, options: { size: "S", color: "Red" }, price: 100, stock: 1 }] });
    assert.equal(reused.status, 409);
    assert.equal(reused.body.error.code, "SKU_TAKEN");
  });

  it("adjusts stock without going negative and keeps it on product edits", async () => {
    const { leafId } = await seedClothing(admin);
    const product = await createTee(admin, leafId);
    const target = product.variants[1].sku;

    assert.equal((await admin.patch(`/api/v1/admin/products/${product.id}/variants/${target}/stock`, { delta: -5 })).body.error.code, "INSUFFICIENT_STOCK");
    const added = await admin.patch(`/api/v1/admin/products/${product.id}/variants/${target}/stock`, { delta: 7 });
    assert.equal(added.status, 200);
    assert.equal(added.body.product.totalStock, 20);

    // An edit made from a form that still shows the old stock does not undo the adjustment.
    const edited = await admin.patch(`/api/v1/admin/products/${product.id}`, { variants: product.variants.map((variant: Record<string, unknown>) => ({ ...variant, price: 49900 })) });
    assert.equal(edited.status, 200, JSON.stringify(edited.body));
    assert.equal(edited.body.product.totalStock, 20);
    assert.equal(edited.body.product.minPrice, 49900);
  });

  it("hides drafts and archived products from the storefront", async () => {
    const { leafId } = await seedClothing(admin);
    const draft = await createTee(admin, leafId, { status: "draft" });
    const shop = new Client(app.baseUrl);
    assert.equal((await shop.get(`/api/v1/products/${draft.slug}`)).status, 404);

    assert.equal((await admin.patch(`/api/v1/admin/products/${draft.id}/status`, { status: "active" })).status, 200);
    const visible = await shop.get(`/api/v1/products/${draft.slug}`);
    assert.equal(visible.status, 200);
    assert.equal(visible.body.product.variants[0].available, 10);
    assert.equal(visible.body.product.variants[1].available, 3);
    assert.equal(visible.body.product.variants[0].stock, undefined, "exact stock stays private");
    assert.equal(visible.body.product.breadcrumbs.length, 2);
  });
});

suite("storefront listing and filters", () => {
  it("filters by category, facets, price and stock, with facet counts", async () => {
    const { leafId, leafSlug, rootSlug } = await seedClothing(admin);
    const black = await createTee(admin, leafId, { title: unique("Black tee ") }, [{ sku: sku(), options: { size: "M", color: "Black" }, price: 50000, stock: 4 }]);
    await createTee(admin, leafId, { title: unique("White tee "), attributes: { material: "Linen", neck: "V-neck" } }, [{ sku: sku(), options: { size: "S", color: "White" }, price: 90000, stock: 0 }]);
    await createTee(admin, leafId, { title: unique("Red tee "), brand: "Stride" }, [{ sku: sku(), options: { size: "L", color: "Red" }, price: 70000, stock: 2 }]);

    const shop = new Client(app.baseUrl);
    assert.equal((await shop.get(`/api/v1/products?category=${rootSlug}`)).body.total, 3, "parent category lists descendants");
    assert.equal((await shop.get(`/api/v1/products?category=${leafSlug}&f_color=Black,Red`)).body.total, 2);
    assert.equal((await shop.get(`/api/v1/products?category=${leafSlug}&f_color=Black,Red&brand=Stride`)).body.total, 1);
    assert.equal((await shop.get(`/api/v1/products?category=${leafSlug}&inStock=true`)).body.total, 2);
    assert.equal((await shop.get(`/api/v1/products?category=${leafSlug}&minPrice=60000&maxPrice=80000`)).body.total, 1);

    const sorted = await shop.get(`/api/v1/products?category=${leafSlug}&sort=price_asc`);
    assert.deepEqual(sorted.body.items.map((item: { minPrice: number }) => item.minPrice), [50000, 70000, 90000]);
    assert.equal(sorted.body.items[0].id, black.id);

    const facets = await shop.get(`/api/v1/products/facets?category=${leafSlug}&f_color=Black`);
    assert.equal(facets.status, 200);
    const color = facets.body.facets.find((group: { key: string }) => group.key === "color");
    // The selected facet still shows its siblings' counts.
    assert.deepEqual(color.values.map((value: { value: string; count: number }) => [value.value, value.count]), [["Black", 1], ["White", 1], ["Red", 1]]);
    const material = facets.body.facets.find((group: { key: string }) => group.key === "material");
    assert.deepEqual(material.values, [{ value: "Cotton", count: 1 }]);
    assert.equal(material.label, "Material");
    assert.deepEqual(facets.body.price, { min: 50000, max: 50000 });
  });

  it("searches by text and rejects malformed filters", async () => {
    const { leafId } = await seedClothing(admin);
    const word = unique("zephyr");
    await createTee(admin, leafId, { title: `The ${word} tee` });
    const shop = new Client(app.baseUrl);
    const found = await shop.get(`/api/v1/products?q=${word}`);
    assert.equal(found.body.total, 1);

    assert.equal((await shop.get("/api/v1/products?f_color=a:b")).status, 400);
    assert.equal((await shop.get("/api/v1/products?limit=500")).status, 400);
    assert.equal((await shop.get("/api/v1/products?minPrice=10&maxPrice=5")).status, 400);
    assert.equal((await shop.get("/api/v1/products?unknown=1")).status, 400);
    assert.equal((await shop.get("/api/v1/products?category=does-not-exist")).status, 404);
  });
});

suite("product images", () => {
  it("attaches verified uploads and deletes removed ones from the bucket", async () => {
    const { leafId } = await seedClothing(admin);
    const key = await uploadImage(app, admin);
    const product = await createTee(admin, leafId, { images: [{ key, alt: "Front" }] });
    assert.equal(product.images[0].url, `https://images.test/${key}`);

    // A key can be claimed only once.
    const reused = await admin.post("/api/v1/admin/products", { title: "Copy", categoryId: leafId, attributes: { material: "Cotton" }, variants: [{ sku: sku(), options: { size: "S", color: "Red" }, price: 100, stock: 1 }], images: [{ key }] });
    assert.equal(reused.status, 422);

    const replacement = await uploadImage(app, admin);
    const updated = await admin.patch(`/api/v1/admin/products/${product.id}`, { images: [{ key: replacement, alt: "" }] });
    assert.equal(updated.status, 200);
    assert.equal(app.storage.objects.has(key), false, "the replaced image was deleted");
    assert.equal(app.storage.objects.has(replacement), true);
  });

  it("rejects wrong types, sizes and files that are not really images", async () => {
    assert.equal((await admin.post("/api/v1/admin/uploads/images", { contentType: "image/svg+xml", size: 100 })).status, 400);
    assert.equal((await admin.post("/api/v1/admin/uploads/images", { contentType: "image/png", size: 6 * 1024 * 1024 })).status, 400);

    const { leafId } = await seedClothing(admin);
    const html = new TextEncoder().encode("<html><script>alert(1)</script></html>");
    const fake = await uploadImage(app, admin, html, "image/png");
    const res = await admin.post("/api/v1/admin/products", { title: "Fake", categoryId: leafId, attributes: { material: "Cotton" }, variants: [{ sku: sku(), options: { size: "S", color: "Red" }, price: 100, stock: 1 }], images: [{ key: fake }] });
    assert.equal(res.status, 422);
    assert.equal(res.body.error.code, "INVALID_IMAGE");

    // Never uploaded at all.
    const ticket = await admin.post("/api/v1/admin/uploads/images", { contentType: "image/png", size: PNG_BYTES.byteLength });
    const missing = await admin.post("/api/v1/admin/products", { title: "Missing", categoryId: leafId, attributes: { material: "Cotton" }, variants: [{ sku: sku(), options: { size: "S", color: "Red" }, price: 100, stock: 1 }], images: [{ key: ticket.body.upload.key }] });
    assert.equal(missing.status, 422);
  });
});

describe("image signatures", () => {
  it("recognises each supported format", () => {
    assert.equal(matchesSignature("image/png", PNG_BYTES), true);
    assert.equal(matchesSignature("image/jpeg", Uint8Array.from([0xff, 0xd8, 0xff, 0xe0])), true);
    assert.equal(matchesSignature("image/webp", new TextEncoder().encode("RIFF\0\0\0\0WEBPVP8 ")), true);
    assert.equal(matchesSignature("image/avif", new TextEncoder().encode("\0\0\0\x1cftypavif")), true);
    assert.equal(matchesSignature("image/jpeg", PNG_BYTES), false);
  });
});
