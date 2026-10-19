import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { createTee, seedClothing, signedInAdmin, signedInCustomer, unique, type SeededCatalog } from "./helpers/actors.js";
import { Client, hasInfra, startApp, startInfra, type Infra, type TestApp } from "./helpers/harness.js";
import { addAddress, addToCart, checkout } from "./helpers/shop.js";

const suite = hasInfra() ? describe : describe.skip;

let infra: Infra;
let app: TestApp;
let admin: Client;
let catalog: SeededCatalog;

before(async () => {
  if (!hasInfra()) return;
  infra = await startInfra();
  app = await startApp(infra.redis);
  admin = (await signedInAdmin(app)).client;
  catalog = await seedClothing(admin);
});

after(async () => {
  if (!hasInfra()) return;
  await app.stop();
  await infra.stop();
});

const HOUR = 3_600_000;
const window = (fromHours: number, toHours: number) => ({ startsAt: new Date(Date.now() + fromHours * HOUR).toISOString(), endsAt: new Date(Date.now() + toHours * HOUR).toISOString() });

async function createSale(body: Record<string, unknown>) {
  const res = await admin.post("/api/v1/admin/sales", { name: unique("Sale "), discountType: "percent", discountValue: 20, appliesTo: "all", ...window(-1, 24), ...body });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return res.body.sale;
}

suite("sales", () => {
  it("validates sales", async () => {
    const base = { name: "Bad sale", discountType: "percent", discountValue: 20, appliesTo: "all", ...window(0, 1) };
    const cases: [Record<string, unknown>, string][] = [
      [{ discountValue: 95 }, "discountValue"],
      [{ appliesTo: "categories" }, "categoryIds"],
      [{ appliesTo: "products" }, "productIds"],
      [window(2, 1), "endsAt"],
      [{ appliesTo: "products", productIds: ["0123456789abcdef01234567"] }, "productIds"],
    ];
    for (const [patch, path] of cases) {
      const res = await admin.post("/api/v1/admin/sales", { ...base, ...patch });
      assert.equal(res.status, 400, JSON.stringify(patch));
      assert.ok(res.body.error.details.some((detail: { path: string }) => detail.path === path), JSON.stringify(res.body));
    }
    assert.equal((await new Client(app.baseUrl).post("/api/v1/admin/sales", base)).status, 401);
  });

  it("discounts a category in the catalogue, cart and order, and reports what it sold", async () => {
    const product = await createTee(admin, catalog.leafId);
    const [cheap] = product.variants;
    const sale = await createSale({ appliesTo: "categories", categoryIds: [catalog.rootId], discountValue: 25 });
    assert.equal(sale.status, "live");
    assert.equal(sale.label, "25% off");

    const shopper = new Client(app.baseUrl);
    const detail = (await shopper.get(`/api/v1/products/${product.slug}`)).body.product;
    assert.equal(detail.minPrice, 44925, "25% off ₹599");
    assert.equal(detail.compareAtPrice, 59900);
    assert.equal(detail.sale.slug, sale.slug);
    assert.equal(detail.variants[1].price, 52425);
    assert.equal(detail.variants[1].compareAtPrice, 69900);

    const listed = (await shopper.get(`/api/v1/products?sale=${sale.slug}&limit=48`)).body.items.map((item: { id: string }) => item.id);
    assert.ok(listed.includes(product.id), "the sale filter lists products in the category");
    assert.ok((await shopper.get("/api/v1/products?onSale=true&limit=48")).body.items.some((item: { id: string }) => item.id === product.id));
    assert.equal((await shopper.get("/api/v1/products?sale=no-such-sale")).body.total, 0);

    const publicSales = (await shopper.get("/api/v1/sales")).body;
    const listedSale = publicSales.live.find((entry: { slug: string }) => entry.slug === sale.slug);
    assert.equal(listedSale.categories[0].slug, catalog.rootSlug);
    assert.equal((await shopper.get(`/api/v1/sales/${sale.slug}`)).body.sale.status, "live");

    const { client } = await signedInCustomer(app);
    await addToCart(client, product.id, cheap.sku, 2);
    const cart = (await client.get("/api/v1/cart")).body.cart;
    assert.equal(cart.lines[0].unitPrice, 44925);
    assert.equal(cart.lines[0].compareAtPrice, 59900);
    assert.equal(cart.lines[0].sale.name, sale.name);
    assert.equal(cart.subtotal, 2 * 44925);

    const placed = await checkout(client, await addAddress(client), "cod");
    assert.equal(placed.status, 201, JSON.stringify(placed.body));
    const item = placed.body.order.items[0];
    assert.equal(item.unitPrice, 44925);
    assert.equal(item.listPrice, 59900);
    assert.equal(item.sale.id, sale.id);
    assert.equal(placed.body.order.pricing.total, 2 * 44925, "free shipping above ₹499");

    const stats = (await admin.get(`/api/v1/admin/sales/${sale.id}`)).body.sale.stats;
    assert.deepEqual(stats, { orders: 1, units: 2, revenue: 2 * 44925, discountGiven: 2 * (59900 - 44925) });

    // Switching the sale off restores list prices everywhere at once.
    assert.equal((await admin.patch(`/api/v1/admin/sales/${sale.id}`, { isActive: false })).body.sale.status, "disabled");
    assert.equal((await shopper.get(`/api/v1/products/${product.slug}`)).body.product.minPrice, 59900);
    assert.equal((await shopper.get(`/api/v1/sales/${sale.slug}`)).status, 404);
  });

  it("picks the best live sale, ignores scheduled ones and never prices below ₹1", async () => {
    const product = await createTee(admin, catalog.leafId, {}, [{ sku: unique("SKU-").toUpperCase(), options: { size: "S", color: "Red" }, price: 50000, stock: 5 }]);
    const shopper = new Client(app.baseUrl);
    const priceNow = async () => (await shopper.get(`/api/v1/products/${product.slug}`)).body.product;

    const scheduled = await createSale({ appliesTo: "products", productIds: [product.id], discountValue: 50, ...window(2, 4) });
    assert.equal(scheduled.status, "scheduled");
    assert.ok((await shopper.get("/api/v1/sales")).body.upcoming.some((entry: { slug: string }) => entry.slug === scheduled.slug));

    const small = await createSale({ appliesTo: "products", productIds: [product.id], discountType: "fixed", discountValue: 5000 });
    assert.equal((await priceNow()).minPrice, 45000);
    const big = await createSale({ appliesTo: "products", productIds: [product.id], discountValue: 30 });
    const best = await priceNow();
    assert.equal(best.minPrice, 35000);
    assert.equal(best.sale.slug, big.slug);

    await admin.patch(`/api/v1/admin/sales/${big.id}`, { discountType: "fixed", discountValue: 9_000_000 });
    assert.equal((await priceNow()).minPrice, 100, "floored at ₹1");

    for (const id of [scheduled.id, small.id, big.id]) assert.equal((await admin.delete(`/api/v1/admin/sales/${id}`)).status, 204);
    assert.equal((await priceNow()).minPrice, 50000);
  });

  it("lists, filters and edits sales in the admin", async () => {
    const sale = await createSale({ name: unique("Monsoon "), ...window(5, 10) });
    const scheduled = (await admin.get("/api/v1/admin/sales?status=scheduled&limit=48")).body.items.map((entry: { id: string }) => entry.id);
    assert.ok(scheduled.includes(sale.id));
    const renamed = await admin.patch(`/api/v1/admin/sales/${sale.id}`, { name: "Monsoon madness", ...window(-1, 2) });
    assert.equal(renamed.body.sale.status, "live");
    assert.equal((await admin.post("/api/v1/admin/sales", { name: "Copy", slug: sale.slug, discountType: "percent", discountValue: 10, appliesTo: "all", ...window(0, 1) })).body.error.code, "SLUG_TAKEN");
    await admin.delete(`/api/v1/admin/sales/${sale.id}`);
    assert.equal((await admin.get(`/api/v1/admin/sales/${sale.id}`)).status, 404);
  });
});

suite("wishlist lists", () => {
  it("groups saved products into named lists per customer", async () => {
    const { client } = await signedInCustomer(app);
    const [first, second] = [await createTee(admin, catalog.leafId), await createTee(admin, catalog.leafId)];

    const gifts = await client.post("/api/v1/wishlist/lists", { name: "Gifts" });
    assert.equal(gifts.status, 201);
    const giftsId = gifts.body.list.id;
    assert.equal((await client.post("/api/v1/wishlist/lists", { name: "gifts" })).body.error.code, "LIST_NAME_TAKEN");
    assert.equal((await client.post("/api/v1/wishlist/lists", { name: "Saved items" })).body.error.code, "LIST_NAME_TAKEN");

    // The heart saves to the default list; choosing a list saves (or moves) into it.
    assert.equal((await client.put(`/api/v1/wishlist/${first.id}`)).status, 204);
    assert.equal((await client.put(`/api/v1/wishlist/${second.id}`, { listId: giftsId })).status, 204);
    let body = (await client.get("/api/v1/wishlist")).body;
    assert.deepEqual(
      body.lists.map((list: { name: string; count: number }) => [list.name, list.count]),
      [["Saved items", 1], ["Gifts", 1]],
    );
    assert.equal(body.items.find((item: { product: { id: string } }) => item.product.id === second.id).listId, giftsId);

    // Tapping the heart again does not move it back out of its list.
    await client.put(`/api/v1/wishlist/${second.id}`);
    await client.put(`/api/v1/wishlist/${first.id}`, { listId: giftsId });
    assert.equal((await client.get("/api/v1/wishlist/lists")).body.lists[1].count, 2);

    // Another customer can neither see nor use this list.
    const other = await signedInCustomer(app);
    assert.equal((await other.client.put(`/api/v1/wishlist/${first.id}`, { listId: giftsId })).status, 404);
    assert.equal((await other.client.get("/api/v1/wishlist/lists")).body.lists.length, 1);

    assert.equal((await client.patch(`/api/v1/wishlist/lists/${giftsId}`, { name: "Birthday" })).body.list.name, "Birthday");
    assert.equal((await client.delete(`/api/v1/wishlist/lists/${giftsId}`)).status, 204);
    body = (await client.get("/api/v1/wishlist")).body;
    assert.equal(body.lists.length, 1);
    assert.equal(body.lists[0].count, 2, "products move back to Saved items");
    assert.ok(body.items.every((item: { listId: string | null }) => item.listId === null));

    const temp = (await client.post("/api/v1/wishlist/lists", { name: "Temp" })).body.list.id;
    await client.put(`/api/v1/wishlist/${first.id}`, { listId: temp });
    await client.delete(`/api/v1/wishlist/lists/${temp}?removeItems=true`);
    assert.deepEqual((await client.get("/api/v1/wishlist/ids")).body.productIds, [second.id]);
  });
});
