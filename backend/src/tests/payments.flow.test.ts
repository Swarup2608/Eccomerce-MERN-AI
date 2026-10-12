import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { Order } from "../modules/orders/order.model.js";
import { createTee, seedClothing, signedInAdmin, signedInCustomer } from "./helpers/actors.js";
import { Client, hasInfra, startApp, startInfra, type Infra, type TestApp } from "./helpers/harness.js";
import { addAddress, addToCart, checkout, postWebhook, razorpayCaptured, stockOf, stripeEvent } from "./helpers/shop.js";

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

async function placeOnline(method: "razorpay" | "stripe", quantity = 1) {
  const customer = await signedInCustomer(app);
  const product = await createTee(admin, categoryId);
  const addressId = await addAddress(customer.client);
  const line = product.variants[0].sku as string;
  await addToCart(customer.client, product.id, line, quantity);
  const res = await checkout(customer.client, addressId, method);
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return { ...customer, product, line, addressId, order: res.body.order, payment: res.body.payment };
}

suite("checkout config", () => {
  it("lists the enabled payment methods without secrets", async () => {
    const res = await new Client(app.baseUrl).get("/api/v1/checkout/config");
    assert.deepEqual(res.body.methods, ["razorpay", "stripe", "cod"]);
    assert.equal(res.body.razorpayKeyId, "rzp_test_harness");
    assert.doesNotMatch(JSON.stringify(res.body), /secret|whsec|sk_/);
  });
});

suite("Razorpay", () => {
  it("holds stock while unpaid and confirms only a verified, captured payment", async () => {
    const { client, email, product, line, order, payment } = await placeOnline("razorpay", 2);
    assert.equal(order.status, "pending_payment");
    assert.equal(order.canPay, true);
    assert.equal(payment.method, "razorpay");
    assert.equal(payment.amount, order.pricing.total);
    assert.equal(await stockOf(product.id, line), 8, "stock is reserved while the customer pays");

    const paid = app.payments.razorpayApi.pay(payment.razorpayOrderId);
    const verifyPath = `/api/v1/orders/${order.id}/payments/razorpay/verify`;
    const forged = await client.post(verifyPath, { ...paid, razorpay_signature: "0".repeat(64) });
    assert.equal(forged.status, 400);
    assert.equal(forged.body.error.code, "INVALID_PAYMENT_SIGNATURE");

    const verified = await client.post(verifyPath, paid);
    assert.equal(verified.status, 200, JSON.stringify(verified.body));
    assert.equal(verified.body.order.status, "confirmed");
    assert.equal(verified.body.order.payment.status, "paid");
    assert.match(app.mailer.last(email)?.subject ?? "", /confirmed/);

    // The webhook for the same payment arrives afterwards: nothing changes.
    const hook = await postWebhook(app, "razorpay", razorpayCaptured({ id: paid.razorpay_payment_id, order_id: paid.razorpay_order_id, amount: order.pricing.total }));
    assert.equal(hook.status, 200);
    const doc = await Order.findById(order.id).lean();
    assert.equal(doc?.statusHistory.filter((entry) => entry.status === "confirmed").length, 1);
  });

  it("refuses a signature for a different order and a payment that was not captured", async () => {
    const first = await placeOnline("razorpay");
    const second = await placeOnline("razorpay");
    const paidForSecond = app.payments.razorpayApi.pay(second.payment.razorpayOrderId);
    const crossed = await first.client.post(`/api/v1/orders/${first.order.id}/payments/razorpay/verify`, paidForSecond);
    assert.equal(crossed.status, 400);

    const failed = app.payments.razorpayApi.pay(first.payment.razorpayOrderId, { status: "failed" });
    const res = await first.client.post(`/api/v1/orders/${first.order.id}/payments/razorpay/verify`, failed);
    assert.equal(res.status, 402);
    assert.equal((await first.client.get(`/api/v1/orders/${first.order.id}`)).body.order.status, "pending_payment");
  });

  it("confirms from the webhook alone, ignores replays and rejects bad signatures", async () => {
    const { order, payment } = await placeOnline("razorpay");
    const paid = app.payments.razorpayApi.pay(payment.razorpayOrderId);
    const event = razorpayCaptured({ id: paid.razorpay_payment_id, order_id: paid.razorpay_order_id, amount: order.pricing.total });

    const forged = await postWebhook(app, "razorpay", event, { signature: "f".repeat(64) });
    assert.equal(forged.status, 400);
    assert.ok(app.audit.count("webhook_signature_invalid") >= 1);

    assert.deepEqual((await postWebhook(app, "razorpay", event, { eventId: "evt_replay_1" })).body, { received: true });
    assert.deepEqual((await postWebhook(app, "razorpay", event, { eventId: "evt_replay_1" })).body, { received: true, duplicate: true });
    assert.equal((await Order.findById(order.id).lean())?.status, "confirmed");
  });

  it("does not confirm a payment for the wrong amount", async () => {
    const { order, payment } = await placeOnline("razorpay");
    const before = app.audit.count("payment_amount_mismatch");
    await postWebhook(app, "razorpay", razorpayCaptured({ id: "pay_short00001", order_id: payment.razorpayOrderId, amount: order.pricing.total - 100 }));
    const doc = await Order.findById(order.id).lean();
    assert.equal(doc?.status, "pending_payment");
    assert.match(doc?.payment.lastError ?? "", /mismatch/);
    assert.equal(app.audit.count("payment_amount_mismatch"), before + 1);
  });

  it("leaves the cart and stock untouched when the gateway is down", async () => {
    const customer = await signedInCustomer(app);
    const product = await createTee(admin, categoryId);
    const addressId = await addAddress(customer.client);
    await addToCart(customer.client, product.id, product.variants[0].sku, 1);
    app.payments.razorpayApi.failNext = true;
    const res = await checkout(customer.client, addressId, "razorpay");
    assert.equal(res.status, 502);
    assert.equal(res.body.error.code, "PAYMENT_PROVIDER_ERROR");
    assert.equal(await stockOf(product.id, product.variants[0].sku), 10);
    assert.equal((await customer.client.get("/api/v1/cart")).body.cart.itemCount, 1);
  });
});

suite("Stripe", () => {
  it("confirms a paid Checkout Session and ignores the replayed event", async () => {
    const { client, order, payment } = await placeOnline("stripe");
    assert.match(payment.url, /^https:\/\/checkout\.stripe\.test\//);
    const [sessionId, session] = [...app.payments.stripeApi.sessions].at(-1) ?? [];
    assert.ok(sessionId && session);
    assert.equal(session.successUrl, `http://localhost:3000/account/orders/${order.id}?payment=success`);
    assert.equal(session.lineItems.reduce((sum, item) => sum + item.unitAmount * item.quantity, 0), order.pricing.total);

    // Reopening the checkout gives the same session.
    assert.equal((await client.post(`/api/v1/orders/${order.id}/pay`)).body.payment.url, payment.url);

    const event = stripeEvent("checkout.session.completed", { id: sessionId, object: "checkout.session", payment_status: "paid", payment_intent: "pi_test_123", amount_total: order.pricing.total, currency: "inr" });
    assert.equal((await postWebhook(app, "stripe", event)).status, 200);
    assert.equal((await postWebhook(app, "stripe", event)).body.duplicate, true);
    const view = (await client.get(`/api/v1/orders/${order.id}`)).body.order;
    assert.equal(view.status, "confirmed");
    assert.equal(view.canPay, false);
    assert.equal((await client.post(`/api/v1/orders/${order.id}/pay`)).body.error.code, "NOT_PAYABLE");
  });

  it("rejects unsigned events and releases stock when the session expires", async () => {
    const { product, line, order } = await placeOnline("stripe", 3);
    const [sessionId] = [...app.payments.stripeApi.sessions].at(-1) ?? [];
    assert.ok(sessionId);
    assert.equal((await postWebhook(app, "stripe", stripeEvent("checkout.session.expired", { id: sessionId }), { signature: "t=1,v1=bad" })).status, 400);
    assert.equal(await stockOf(product.id, line), 7);

    assert.equal((await postWebhook(app, "stripe", stripeEvent("checkout.session.expired", { id: sessionId }))).status, 200);
    assert.equal((await Order.findById(order.id).lean())?.status, "cancelled");
    assert.equal(await stockOf(product.id, line), 10);
  });
});

suite("expiry, cancellation and refunds", () => {
  it("expires unpaid orders, then refunds a payment that arrives too late", async () => {
    const { product, line, order, payment } = await placeOnline("razorpay", 2);
    await Order.updateOne({ _id: order.id }, { $set: { expiresAt: new Date(Date.now() - 1000) } });
    assert.ok((await app.commerce.orders.expireStale()) >= 1);
    assert.equal((await Order.findById(order.id).lean())?.status, "cancelled");
    assert.equal(await stockOf(product.id, line), 10);

    const paid = app.payments.razorpayApi.pay(payment.razorpayOrderId);
    await postWebhook(app, "razorpay", razorpayCaptured({ id: paid.razorpay_payment_id, order_id: paid.razorpay_order_id, amount: order.pricing.total }));
    const doc = await Order.findById(order.id).lean();
    assert.equal(doc?.status, "cancelled", "a late payment never revives the order");
    assert.equal(doc?.payment.status, "refunded");
    assert.equal(app.payments.razorpayApi.refunds.at(-1)?.paymentId, paid.razorpay_payment_id);
    assert.equal(await stockOf(product.id, line), 10);
  });

  it("refunds a paid order when the customer cancels it", async () => {
    const { client, order, payment } = await placeOnline("razorpay");
    const paid = app.payments.razorpayApi.pay(payment.razorpayOrderId);
    await client.post(`/api/v1/orders/${order.id}/payments/razorpay/verify`, paid);
    const cancelled = await client.post(`/api/v1/orders/${order.id}/cancel`);
    assert.equal(cancelled.body.order.status, "cancelled");
    assert.equal(cancelled.body.order.payment.status, "refunded");
    assert.equal(cancelled.body.order.payment.amountRefunded, order.pricing.total);
  });

  it("allows partial refunds but never more than was paid, even when requested concurrently", async () => {
    const { order } = await placeOnline("stripe");
    const [sessionId] = [...app.payments.stripeApi.sessions].at(-1) ?? [];
    await postWebhook(app, "stripe", stripeEvent("checkout.session.completed", { id: sessionId, payment_status: "paid", payment_intent: "pi_partial_1", amount_total: order.pricing.total, currency: "inr" }));

    const path = `/api/v1/admin/orders/${order.id}/refund`;
    const partial = await admin.post(path, { amount: 10000, reason: "Goodwill" });
    assert.equal(partial.body.order.payment.status, "partially_refunded");
    assert.equal(partial.body.order.refundable, order.pricing.total - 10000);
    assert.equal((await admin.post(path, { amount: order.pricing.total, reason: "Too much" })).body.error.code, "REFUND_TOO_LARGE");

    const remaining = order.pricing.total - 10000;
    const racing = await Promise.all([admin.post(path, { amount: remaining, reason: "A" }), admin.post(path, { amount: remaining, reason: "B" })]);
    assert.deepEqual(racing.map((res) => res.status).sort(), [200, 409]);
    const doc = await Order.findById(order.id).lean();
    assert.equal(doc?.payment.amountRefunded, order.pricing.total);
    assert.equal(doc?.payment.status, "refunded");
    assert.equal(app.payments.stripeApi.refunds.filter((refund) => refund.paymentIntentId === "pi_partial_1").length, 2);
  });
});
