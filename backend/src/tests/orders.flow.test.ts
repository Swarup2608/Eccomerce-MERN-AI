import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";
import { createTee, seedClothing, signedInAdmin, signedInCustomer, sku } from "./helpers/actors.js";
import { Client, hasInfra, startApp, startInfra, type Infra, type TestApp } from "./helpers/harness.js";
import { addAddress, addToCart, checkout, stockOf } from "./helpers/shop.js";

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

async function shopperWithCart(quantity = 1, variants?: Record<string, unknown>[]) {
  const customer = await signedInCustomer(app);
  const product = await createTee(admin, categoryId, {}, variants);
  const addressId = await addAddress(customer.client);
  await addToCart(customer.client, product.id, product.variants[0].sku, quantity);
  return { ...customer, product, addressId, sku: product.variants[0].sku as string };
}

suite("checkout with cash on delivery", () => {
  it("re-prices from the catalogue, reserves stock, empties the cart and emails the customer", async () => {
    const { client, email, product, addressId, sku: line } = await shopperWithCart(2);
    const res = await checkout(client, addressId, "cod");
    assert.equal(res.status, 201, JSON.stringify(res.body));
    const { order, payment } = res.body;
    assert.equal(payment, null);
    assert.equal(order.status, "confirmed");
    assert.match(order.orderNumber, /^ORD-\d{6}-[2-9A-HJKMNP-Z]{6}$/);
    assert.deepEqual(order.pricing, { subtotal: 119800, shipping: 0, discount: 0, total: 119800 });
    assert.equal(order.items[0].title, product.title);
    assert.equal(order.shippingAddress.city, "Bengaluru");

    assert.equal(await stockOf(product.id, line), 8);
    assert.equal((await client.get("/api/v1/cart")).body.cart.itemCount, 0);
    assert.match(app.mailer.last(email)?.subject ?? "", /confirmed/);
    assert.equal((await client.get("/api/v1/orders")).body.total, 1);
  });

  it("charges shipping below the free-shipping threshold", async () => {
    const { client, addressId } = await shopperWithCart(1, [{ sku: sku(), options: { size: "M", color: "Black" }, price: 29900, stock: 5 }]);
    const { order } = (await checkout(client, addressId, "cod")).body;
    assert.deepEqual(order.pricing, { subtotal: 29900, shipping: 4900, discount: 0, total: 34800 });
  });

  it("returns the same order for a repeated idempotency key", async () => {
    const { client, product, addressId, sku: line } = await shopperWithCart(1);
    const key = randomUUID();
    const [first, second] = await Promise.all([checkout(client, addressId, "cod", key), checkout(client, addressId, "cod", key)]);
    assert.equal(first.status, 201);
    assert.equal(second.status, 201);
    assert.equal(first.body.order.id, second.body.order.id);
    assert.equal(await stockOf(product.id, line), 9, "stock taken once");
  });

  it("sells the last unit to exactly one of two simultaneous buyers", async () => {
    const product = await createTee(admin, categoryId, {}, [{ sku: sku(), options: { size: "S", color: "Red" }, price: 99900, stock: 1 }]);
    const line = product.variants[0].sku;
    const buyers = await Promise.all([signedInCustomer(app), signedInCustomer(app)]);
    const addresses = await Promise.all(buyers.map((buyer) => addAddress(buyer.client)));
    for (const buyer of buyers) await addToCart(buyer.client, product.id, line, 1);

    const results = await Promise.all(buyers.map((buyer, index) => checkout(buyer.client, addresses[index] ?? "", "cod")));
    assert.deepEqual(results.map((res) => res.status).sort(), [201, 409]);
    assert.equal(results.find((res) => res.status === 409)?.body.error.code, "OUT_OF_STOCK");
    assert.equal(await stockOf(product.id, line), 0);
  });

  it("refuses an empty cart, a cart with problems and someone else's address", async () => {
    const empty = await signedInCustomer(app);
    const emptyAddress = await addAddress(empty.client);
    assert.equal((await checkout(empty.client, emptyAddress, "cod")).body.error.code, "CART_EMPTY");

    const { client, product, addressId, sku: line } = await shopperWithCart(3);
    await admin.patch(`/api/v1/admin/products/${product.id}/variants/${line}/stock`, { stock: 2 });
    const res = await checkout(client, addressId, "cod");
    assert.equal(res.status, 409);
    assert.equal(res.body.error.code, "CART_HAS_ISSUES");

    assert.equal((await checkout(client, emptyAddress, "cod")).body.error.code, "INVALID_ADDRESS");
    assert.equal((await new Client(app.baseUrl).post("/api/v1/orders", {})).status, 401);
  });
});

suite("customer orders", () => {
  it("keeps orders private and gives stock back on cancellation", async () => {
    const { client, product, addressId, sku: line } = await shopperWithCart(2);
    const { order } = (await checkout(client, addressId, "cod")).body;
    const { client: other } = await signedInCustomer(app);
    assert.equal((await other.get(`/api/v1/orders/${order.id}`)).status, 404);
    assert.equal((await other.post(`/api/v1/orders/${order.id}/cancel`)).status, 404);

    const cancelled = await client.post(`/api/v1/orders/${order.id}/cancel`, { reason: "Changed my mind" });
    assert.equal(cancelled.status, 200);
    assert.equal(cancelled.body.order.status, "cancelled");
    assert.equal(await stockOf(product.id, line), 10);
    assert.equal((await client.post(`/api/v1/orders/${order.id}/cancel`)).body.error.code, "NOT_CANCELLABLE");
    assert.equal(await stockOf(product.id, line), 10, "stock is released only once");
  });
});

suite("admin order management", () => {
  it("is admin only", async () => {
    const { client } = await signedInCustomer(app);
    assert.equal((await client.get("/api/v1/admin/orders")).status, 401);
    assert.equal((await client.get("/api/v1/admin/stats")).status, 401);
    assert.equal((await client.get("/api/v1/admin/customers")).status, 401);
  });

  it("follows the fulfilment lifecycle, collects COD on delivery and restocks returns", async () => {
    const { client, email, product, addressId, sku: line } = await shopperWithCart(1);
    const { order } = (await checkout(client, addressId, "cod")).body;
    const path = `/api/v1/admin/orders/${order.id}/status`;

    assert.equal((await admin.patch(path, { status: "delivered" })).body.error.code, "INVALID_TRANSITION");
    assert.equal((await admin.patch(path, { status: "processing" })).status, 200);
    assert.equal((await admin.patch(path, { status: "shipped" })).status, 400, "shipping needs tracking");
    const shipped = await admin.patch(path, { status: "shipped", tracking: { carrier: "Delhivery", number: "DL123", url: "https://track.example.com/DL123" } });
    assert.equal(shipped.status, 200);
    assert.deepEqual(shipped.body.order.allowedTransitions, ["delivered"]);
    assert.match(app.mailer.last(email)?.text ?? "", /DL123/);
    assert.equal((await client.post(`/api/v1/orders/${order.id}/cancel`)).body.error.code, "NOT_CANCELLABLE", "too late for the customer to cancel");

    const delivered = await admin.patch(path, { status: "delivered" });
    assert.equal(delivered.body.order.payment.status, "paid");
    assert.equal(delivered.body.order.payment.amountPaid, order.pricing.total);

    assert.equal(await stockOf(product.id, line), 9);
    assert.equal((await admin.patch(path, { status: "returned", note: "Wrong size" })).status, 200);
    assert.equal(await stockOf(product.id, line), 10);

    const refunded = await admin.post(`/api/v1/admin/orders/${order.id}/refund`, { reason: "Returned" });
    assert.equal(refunded.status, 200);
    assert.equal(refunded.body.order.payment.status, "refunded");
    assert.match(refunded.body.order.payment.refunds[0].refundId, /^manual_/);
    assert.equal((await admin.post(`/api/v1/admin/orders/${order.id}/refund`, { reason: "Again" })).body.error.code, "NOT_REFUNDABLE");

    const history = (await client.get(`/api/v1/orders/${order.id}`)).body.order.statusHistory.map((entry: { status: string }) => entry.status);
    assert.deepEqual(history, ["confirmed", "processing", "shipped", "delivered", "returned"]);
  });

  it("searches orders and reports stats and customers", async () => {
    const { client, email, id, addressId } = await shopperWithCart(1);
    const { order } = (await checkout(client, addressId, "cod")).body;

    assert.equal((await admin.get(`/api/v1/admin/orders?q=${order.orderNumber}`)).body.items[0].id, order.id);
    assert.equal((await admin.get(`/api/v1/admin/orders?q=${email}`)).body.total, 1);
    assert.equal((await admin.get("/api/v1/admin/orders?status=confirmed&paymentMethod=cod&limit=1")).body.items.length, 1);

    const stats = (await admin.get("/api/v1/admin/stats")).body.stats;
    assert.ok(stats.today.orders >= 1);
    assert.equal(stats.last30Days.daily.length, 30);
    assert.ok(stats.toFulfil >= 1);

    const customer = await admin.get(`/api/v1/admin/customers/${id}`);
    assert.equal(customer.body.customer.orderCount, 1);
    assert.equal(customer.body.customer.orders[0].id, order.id);

    // Suspending a customer signs them out immediately.
    assert.equal((await admin.patch(`/api/v1/admin/customers/${id}/status`, { status: "suspended" })).status, 200);
    assert.equal((await client.get("/api/v1/orders")).status, 401);
  });

  it("archives an ordered product instead of deleting it", async () => {
    const { client, product, addressId } = await shopperWithCart(1);
    await checkout(client, addressId, "cod");
    const res = await admin.delete(`/api/v1/admin/products/${product.id}`);
    assert.deepEqual(res.body, { archived: true });
    assert.equal((await admin.get(`/api/v1/admin/products/${product.id}`)).body.product.status, "archived");
  });
});
