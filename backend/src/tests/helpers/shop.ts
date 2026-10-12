import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import Stripe from "stripe";
import { Product } from "../../modules/products/product.model.js";
import { RAZORPAY_CONFIG, STRIPE_CONFIG } from "./fake-gateways.js";
import { createHmac } from "node:crypto";
import type { Client, TestApp } from "./harness.js";

export const ADDRESS = { fullName: "Asha Rao", phone: "9876543210", line1: "12 MG Road", city: "Bengaluru", state: "Karnataka", postalCode: "560001" };

export async function addAddress(client: Client): Promise<string> {
  const res = await client.post("/api/v1/addresses", ADDRESS);
  assert.equal(res.status, 201);
  return res.body.address.id as string;
}

export async function addToCart(client: Client, productId: string, sku: string, quantity = 1): Promise<void> {
  const res = await client.post("/api/v1/cart/items", { productId, sku, quantity });
  assert.equal(res.status, 200, JSON.stringify(res.body));
}

export const checkout = (client: Client, addressId: string, paymentMethod: "cod" | "razorpay" | "stripe", idempotencyKey: string = randomUUID()) =>
  client.post("/api/v1/orders", { addressId, paymentMethod, idempotencyKey });

export async function stockOf(productId: string, sku: string): Promise<number> {
  const doc = await Product.findById(productId).lean();
  return doc?.variants.find((variant) => variant.sku === sku)?.stock ?? -1;
}

const stripe = new Stripe(STRIPE_CONFIG.secretKey);

// Posts a webhook exactly as the gateway would: raw JSON body plus its signature header.
export async function postWebhook(app: TestApp, provider: "razorpay" | "stripe", payload: unknown, options: { signature?: string; eventId?: string } = {}): Promise<{ status: number; body: { received?: boolean; duplicate?: boolean } }> {
  const body = JSON.stringify(payload);
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (provider === "razorpay") {
    headers["x-razorpay-signature"] = options.signature ?? createHmac("sha256", RAZORPAY_CONFIG.webhookSecret).update(body).digest("hex");
    headers["x-razorpay-event-id"] = options.eventId ?? `evt_${randomUUID()}`;
  } else {
    headers["stripe-signature"] = options.signature ?? stripe.webhooks.generateTestHeaderString({ payload: body, secret: STRIPE_CONFIG.webhookSecret });
  }
  const res = await fetch(`${app.baseUrl}/api/v1/webhooks/${provider}`, { method: "POST", headers, body });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : {} };
}

export const razorpayCaptured = (payment: { id: string; order_id: string; amount: number }) => ({
  event: "payment.captured",
  payload: { payment: { entity: { ...payment, currency: "INR", status: "captured" } } },
});

export const stripeEvent = (type: string, object: Record<string, unknown>, id = `evt_${randomUUID().replace(/-/g, "")}`) => ({ id, object: "event", type, data: { object } });
