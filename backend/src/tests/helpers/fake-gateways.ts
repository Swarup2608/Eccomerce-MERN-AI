import { createHmac } from "node:crypto";
import { providerError } from "../../modules/payments/gateway.js";
import { RazorpayGateway, type RazorpayApi, type RazorpayPayment } from "../../modules/payments/razorpay.js";
import { StripeGateway, type CheckoutSessionParams, type StripeApi } from "../../modules/payments/stripe.js";

export const RAZORPAY_CONFIG = { keyId: "rzp_test_harness", keySecret: "rzp-key-secret", webhookSecret: "rzp-webhook-secret" };
export const STRIPE_CONFIG = { secretKey: "sk_test_harness", webhookSecret: "whsec_harness" };

let sequence = 0;
const next = (prefix: string): string => `${prefix}${(sequence += 1).toString().padStart(8, "0")}`;

// Stands in for Razorpay's REST API. Tests "pay" an order with `pay`, which is what the hosted checkout would do.
export class FakeRazorpayApi implements RazorpayApi {
  readonly orders = new Map<string, { amount: number; receipt: string }>();
  readonly payments = new Map<string, RazorpayPayment>();
  readonly refunds: { paymentId: string; amount: number; idempotencyKey: string }[] = [];
  failNext = false;

  private maybeFail(): void {
    if (this.failNext) {
      this.failNext = false;
      throw providerError("Razorpay 500");
    }
  }

  createOrder(body: { amount: number; receipt: string }): Promise<{ id: string }> {
    this.maybeFail();
    const id = next("order_");
    this.orders.set(id, { amount: body.amount, receipt: body.receipt });
    return Promise.resolve({ id });
  }

  // Simulates a customer paying in Razorpay Checkout; returns what the browser callback receives.
  pay(razorpayOrderId: string, options: { amount?: number; status?: RazorpayPayment["status"] } = {}): { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string } {
    const order = this.orders.get(razorpayOrderId);
    if (!order) throw new Error(`unknown Razorpay order ${razorpayOrderId}`);
    const id = next("pay_");
    this.payments.set(id, { id, order_id: razorpayOrderId, amount: options.amount ?? order.amount, currency: "INR", status: options.status ?? "captured" });
    const razorpay_signature = createHmac("sha256", RAZORPAY_CONFIG.keySecret).update(`${razorpayOrderId}|${id}`).digest("hex");
    return { razorpay_order_id: razorpayOrderId, razorpay_payment_id: id, razorpay_signature };
  }

  fetchPayment(paymentId: string): Promise<RazorpayPayment> {
    const payment = this.payments.get(paymentId);
    if (!payment) return Promise.reject(providerError("Razorpay 400: payment not found"));
    return Promise.resolve({ ...payment });
  }

  capture(paymentId: string, amount: number): Promise<RazorpayPayment> {
    const payment = this.payments.get(paymentId);
    if (!payment || payment.amount !== amount) return Promise.reject(providerError("Razorpay 400: capture failed"));
    payment.status = "captured";
    return Promise.resolve({ ...payment });
  }

  refund(paymentId: string, amount: number, idempotencyKey: string): Promise<{ id: string; status: string }> {
    this.maybeFail();
    this.refunds.push({ paymentId, amount, idempotencyKey });
    return Promise.resolve({ id: next("rfnd_"), status: "processed" });
  }
}

export class FakeStripeApi implements StripeApi {
  readonly sessions = new Map<string, CheckoutSessionParams & { status: "open" | "expired" | "complete" }>();
  readonly refunds: { paymentIntentId: string; amount: number; idempotencyKey: string }[] = [];
  failNext = false;

  createCheckoutSession(params: CheckoutSessionParams): Promise<{ id: string; url: string }> {
    if (this.failNext) {
      this.failNext = false;
      return Promise.reject(providerError("Stripe: api error"));
    }
    const id = next("cs_test_");
    this.sessions.set(id, { ...params, status: "open" });
    return Promise.resolve({ id, url: `https://checkout.stripe.test/c/pay/${id}` });
  }

  expireCheckoutSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (session) session.status = "expired";
    return Promise.resolve();
  }

  refund(paymentIntentId: string, amount: number, idempotencyKey: string): Promise<{ id: string; status: string | null }> {
    this.refunds.push({ paymentIntentId, amount, idempotencyKey });
    return Promise.resolve({ id: next("re_"), status: "succeeded" });
  }
}

export interface FakePayments {
  razorpayApi: FakeRazorpayApi;
  stripeApi: FakeStripeApi;
  razorpay: RazorpayGateway;
  stripe: StripeGateway;
}

export function fakePayments(storefrontUrl: string): FakePayments {
  const razorpayApi = new FakeRazorpayApi();
  const stripeApi = new FakeStripeApi();
  return { razorpayApi, stripeApi, razorpay: new RazorpayGateway(RAZORPAY_CONFIG, razorpayApi), stripe: new StripeGateway(STRIPE_CONFIG, storefrontUrl, stripeApi) };
}
