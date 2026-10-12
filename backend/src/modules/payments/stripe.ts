import Stripe from "stripe";
import type { StripeConfig } from "../../config/env.js";
import { CURRENCY, providerError, type PayableOrder, type PaymentGateway, type PaymentSetup, type RefundResult } from "./gateway.js";

export interface CheckoutSessionParams {
  orderId: string;
  orderNumber: string;
  customerEmail: string;
  lineItems: { name: string; unitAmount: number; quantity: number }[];
  successUrl: string;
  cancelUrl: string;
  expiresAt: Date;
}

// The few Stripe calls we make. The real one uses the SDK; tests swap in a fake.
export interface StripeApi {
  createCheckoutSession(params: CheckoutSessionParams, idempotencyKey: string): Promise<{ id: string; url: string }>;
  expireCheckoutSession(sessionId: string): Promise<void>;
  refund(paymentIntentId: string, amount: number, idempotencyKey: string): Promise<{ id: string; status: string | null }>;
}

export function stripeSdkApi(client: Stripe): StripeApi {
  const wrap = async <T>(call: () => Promise<T>): Promise<T> => {
    try {
      return await call();
    } catch (error) {
      throw providerError(error instanceof Error ? `Stripe: ${error.message}` : "Stripe error");
    }
  };
  return {
    createCheckoutSession: (params, idempotencyKey) =>
      wrap(async () => {
        const session = await client.checkout.sessions.create(
          {
            mode: "payment",
            currency: CURRENCY.toLowerCase(),
            customer_email: params.customerEmail,
            client_reference_id: params.orderId,
            metadata: { orderId: params.orderId, orderNumber: params.orderNumber },
            payment_intent_data: { metadata: { orderId: params.orderId, orderNumber: params.orderNumber } },
            line_items: params.lineItems.map((item) => ({ quantity: item.quantity, price_data: { currency: CURRENCY.toLowerCase(), unit_amount: item.unitAmount, product_data: { name: item.name.slice(0, 250) } } })),
            success_url: params.successUrl,
            cancel_url: params.cancelUrl,
            expires_at: Math.floor(params.expiresAt.getTime() / 1000),
          },
          { idempotencyKey },
        );
        if (!session.url) throw new Error("Checkout Session has no URL");
        return { id: session.id, url: session.url };
      }),
    expireCheckoutSession: (sessionId) =>
      wrap(async () => {
        await client.checkout.sessions.expire(sessionId);
      }),
    refund: (paymentIntentId, amount, idempotencyKey) =>
      wrap(async () => {
        const refund = await client.refunds.create({ payment_intent: paymentIntentId, amount }, { idempotencyKey });
        return { id: refund.id, status: refund.status };
      }),
  };
}

export class StripeGateway implements PaymentGateway {
  readonly method = "stripe" as const;
  private readonly client: Stripe;
  private readonly api: StripeApi;

  constructor(
    private readonly config: StripeConfig,
    private readonly storefrontUrl: string,
    api?: StripeApi,
  ) {
    this.client = new Stripe(config.secretKey, { maxNetworkRetries: 2, timeout: 15_000 });
    this.api = api ?? stripeSdkApi(this.client);
  }

  async createPayment(order: PayableOrder): Promise<PaymentSetup> {
    const lineItems = order.items.map((item) => ({ name: item.title, unitAmount: item.unitPrice, quantity: item.quantity }));
    if (order.shipping > 0) lineItems.push({ name: "Shipping", unitAmount: order.shipping, quantity: 1 });
    const returnUrl = `${this.storefrontUrl}/account/orders/${order.id}`;
    const session = await this.api.createCheckoutSession(
      { orderId: order.id, orderNumber: order.orderNumber, customerEmail: order.customer.email, lineItems, successUrl: `${returnUrl}?payment=success`, cancelUrl: `${returnUrl}?payment=cancelled`, expiresAt: order.expiresAt },
      // A new key per session: a retry after expiry must be able to create a fresh session for the same order.
      `checkout-${order.id}-${order.expiresAt.getTime()}`,
    );
    return { providerOrderId: session.id, client: { method: "stripe", url: session.url } };
  }

  // Verifies the Stripe-Signature header against the raw body (also checks the timestamp to stop replays).
  parseWebhook(rawBody: Buffer, signature: unknown): Stripe.Event | null {
    if (typeof signature !== "string") return null;
    try {
      return this.client.webhooks.constructEvent(rawBody, signature, this.config.webhookSecret);
    } catch {
      return null;
    }
  }

  async refund(paymentIntentId: string, amount: number, idempotencyKey: string): Promise<RefundResult> {
    const refund = await this.api.refund(paymentIntentId, amount, idempotencyKey);
    return { refundId: refund.id, status: refund.status === "succeeded" ? "processed" : "pending" };
  }

  async cancelPayment(sessionId: string): Promise<void> {
    await this.api.expireCheckoutSession(sessionId);
  }
}
