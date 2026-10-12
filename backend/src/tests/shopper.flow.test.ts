import assert from "node:assert/strict";
import { after, before, it } from "node:test";
import { describe } from "node:test";
import { createTee, seedClothing, signedInAdmin, signedInCustomer } from "./helpers/actors.js";
import { Client, hasInfra, startApp, startInfra, type Infra, type TestApp } from "./helpers/harness.js";

const suite = hasInfra() ? describe : describe.skip;

let infra: Infra;
let app: TestApp;
let admin: Client;
let categoryId: string;

before(async () => {
  if (!hasInfra()) return;
  infra = await startInfra();
  app = await startApp(infra.redis);
  admin = (await signedInAdmin(app)).client;
  categoryId = (await seedClothing(admin)).leafId;
});

after(async () => {
  if (!hasInfra()) return;
  await app.stop();
  await infra.stop();
});

const ADDRESS = { fullName: "Asha Rao", phone: "+91 98765-43210", line1: "12 MG Road", city: "Bengaluru", state: "Karnataka", postalCode: "560001" };

suite("cart", () => {
  it("needs a customer session", async () => {
    assert.equal((await new Client(app.baseUrl).get("/api/v1/cart")).status, 401);
  });

  it("adds, merges quantities, enforces stock and prices from the product", async () => {
    const { client } = await signedInCustomer(app);
    const product = await createTee(admin, categoryId);
    const [cheap, scarce] = product.variants;

    assert.deepEqual((await client.get("/api/v1/cart")).body.cart, { lines: [], itemCount: 0, subtotal: 0, hasIssues: false });
    assert.equal((await client.post("/api/v1/cart/items", { productId: product.id, sku: cheap.sku, quantity: 2 })).status, 200);
    const again = await client.post("/api/v1/cart/items", { productId: product.id, sku: cheap.sku.toLowerCase() });
    assert.equal(again.body.cart.lines[0].quantity, 3, "the same SKU is one line");

    const tooMany = await client.post("/api/v1/cart/items", { productId: product.id, sku: scarce.sku, quantity: 4 });
    assert.equal(tooMany.status, 409);
    assert.equal(tooMany.body.error.code, "INSUFFICIENT_STOCK");

    await client.post("/api/v1/cart/items", { productId: product.id, sku: scarce.sku, quantity: 3 });
    const cart = (await client.get("/api/v1/cart")).body.cart;
    assert.equal(cart.itemCount, 6);
    assert.equal(cart.subtotal, 3 * 59900 + 3 * 69900);

    // A price change shows up in the cart immediately.
    await admin.patch(`/api/v1/admin/products/${product.id}`, { variants: product.variants.map((variant: Record<string, unknown>) => ({ ...variant, price: 10000 })) });
    assert.equal((await client.get("/api/v1/cart")).body.cart.subtotal, 6 * 10000);

    // Stock drops below the cart quantity: the line is flagged, and lowering the quantity fixes it.
    await admin.patch(`/api/v1/admin/products/${product.id}/variants/${scarce.sku}/stock`, { stock: 1 });
    const flagged = (await client.get("/api/v1/cart")).body.cart;
    assert.equal(flagged.hasIssues, true);
    assert.equal(flagged.lines[1].status, "insufficient_stock");
    assert.equal(flagged.lines[1].available, 1);
    const fixed = await client.patch(`/api/v1/cart/items/${scarce.sku}`, { quantity: 1 });
    assert.equal(fixed.body.cart.hasIssues, false);

    assert.equal((await client.patch(`/api/v1/cart/items/${cheap.sku}`, { quantity: 0 })).body.cart.lines.length, 1);
    assert.equal((await client.delete("/api/v1/cart")).status, 204);
    assert.equal((await client.get("/api/v1/cart")).body.cart.itemCount, 0);
  });

  it("refuses unavailable products and flags lines that become unavailable", async () => {
    const { client } = await signedInCustomer(app);
    const product = await createTee(admin, categoryId);
    const draft = await createTee(admin, categoryId, { status: "draft" });
    assert.equal((await client.post("/api/v1/cart/items", { productId: draft.id, sku: draft.variants[0].sku })).body.error.code, "PRODUCT_UNAVAILABLE");
    assert.equal((await client.post("/api/v1/cart/items", { productId: product.id, sku: draft.variants[0].sku })).body.error.code, "PRODUCT_UNAVAILABLE", "SKU must belong to the product");
    assert.equal((await client.post("/api/v1/cart/items", { productId: product.id, sku: product.variants[0].sku, quantity: 11 })).status, 400);

    await client.post("/api/v1/cart/items", { productId: product.id, sku: product.variants[0].sku });
    await admin.patch(`/api/v1/admin/products/${product.id}/status`, { status: "archived" });
    const cart = (await client.get("/api/v1/cart")).body.cart;
    assert.equal(cart.lines[0].status, "unavailable");
    assert.equal(cart.subtotal, 0);
  });

  it("merges a guest cart, dropping what cannot be bought", async () => {
    const { client } = await signedInCustomer(app);
    const product = await createTee(admin, categoryId);
    const archived = await createTee(admin, categoryId, { status: "archived" });
    const merged = await client.post("/api/v1/cart/merge", {
      items: [
        { productId: product.id, sku: product.variants[1].sku, quantity: 9 },
        { productId: archived.id, sku: archived.variants[0].sku, quantity: 1 },
      ],
    });
    assert.equal(merged.status, 200);
    assert.equal(merged.body.cart.lines.length, 1);
    assert.equal(merged.body.cart.lines[0].quantity, 3, "capped at the stock");
  });
});

suite("wishlist", () => {
  it("saves products idempotently and keeps them per customer", async () => {
    const { client } = await signedInCustomer(app);
    const { client: other } = await signedInCustomer(app);
    const product = await createTee(admin, categoryId);

    assert.equal((await client.put(`/api/v1/wishlist/${product.id}`)).status, 204);
    assert.equal((await client.put(`/api/v1/wishlist/${product.id}`)).status, 204);
    assert.deepEqual((await client.get("/api/v1/wishlist/ids")).body.productIds, [product.id]);
    assert.equal((await other.get("/api/v1/wishlist")).body.items.length, 0);

    await admin.patch(`/api/v1/admin/products/${product.id}/status`, { status: "archived" });
    const items = (await client.get("/api/v1/wishlist")).body.items;
    assert.equal(items.length, 1);
    assert.equal(items[0].available, false);

    assert.equal((await client.delete(`/api/v1/wishlist/${product.id}`)).status, 204);
    assert.equal((await client.get("/api/v1/wishlist")).body.items.length, 0);
    assert.equal((await client.put("/api/v1/wishlist/not-an-id")).status, 404);
  });
});

suite("addresses", () => {
  it("validates Indian addresses and keeps exactly one default", async () => {
    const { client } = await signedInCustomer(app);
    assert.equal((await client.post("/api/v1/addresses", { ...ADDRESS, postalCode: "56001" })).status, 400);
    assert.equal((await client.post("/api/v1/addresses", { ...ADDRESS, state: "Atlantis" })).status, 400);

    const first = await client.post("/api/v1/addresses", ADDRESS);
    assert.equal(first.status, 201);
    assert.equal(first.body.address.phone, "9876543210");
    assert.equal(first.body.address.isDefault, true, "the first address is the default");

    const second = await client.post("/api/v1/addresses", { ...ADDRESS, line1: "4 Park St", isDefault: true });
    let list = (await client.get("/api/v1/addresses")).body.addresses;
    assert.deepEqual(list.map((address: { isDefault: boolean }) => address.isDefault), [true, false]);
    assert.equal(list[0].id, second.body.address.id);

    await client.delete(`/api/v1/addresses/${second.body.address.id}`);
    list = (await client.get("/api/v1/addresses")).body.addresses;
    assert.equal(list[0].isDefault, true, "the default moves to a remaining address");
  });

  it("never exposes another customer's address", async () => {
    const { client } = await signedInCustomer(app);
    const { client: intruder } = await signedInCustomer(app);
    const created = await client.post("/api/v1/addresses", ADDRESS);
    const id = created.body.address.id;
    assert.equal((await intruder.patch(`/api/v1/addresses/${id}`, { city: "Mysuru" })).status, 404);
    assert.equal((await intruder.delete(`/api/v1/addresses/${id}`)).status, 404);
    assert.equal((await client.get("/api/v1/addresses")).body.addresses[0].city, "Bengaluru");
  });
});
