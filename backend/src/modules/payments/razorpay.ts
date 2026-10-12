import { createHmac, timingSafeEqual } from "node:crypto";
import type { RazorpayConfig } from "../../config/env.js";
import { CURRENCY, providerError, type PayableOrder, type PaymentGateway, type PaymentSetup, type RefundResult } from "./gateway.js";

export interface RazorpayPayment {
  id: string;
  order_id: string;
  amount: number;
  currency: string;
  status: "created" | "authorized" | "captured" | "refunded" | "failed";
}

// The few Razorpay REST calls we make. The real one talks HTTPS; tests swap in a fake.
export interface RazorpayApi {
  createOrder(body: { amount: number; currency: string; receipt: string; notes: Record<string, string> }): Promise<{ id: string }>;
  fetchPayment(paymentId: string): Promise<RazorpayPayment>;
  capture(paymentId: string, amount: number): Promise<RazorpayPayment>;
  refund(paymentId: string, amount: number, idempotencyKey: string): Promise<{ id: string; status: string }>;
}

const API_BASE = "https://api.razorpay.com/v1";
const TIMEOUT_MS = 15_000;

export function razorpayHttpApi(config: Pick<RazorpayConfig, "keyId" | "keySecret">): RazorpayApi {
  const auth = `Basic ${Buffer.from(`${config.keyId}:${config.keySecret}`).toString("base64")}`;
  const call = async <T>(method: "GET" | "POST", path: string, body?: unknown, headers: Record<string, string> = {}): Promise<T> => {
    let res: Response;
    try {
      res = await fetch(`${API_BASE}${path}`, {
        method,
        headers: { Authorization: auth, Accept: "application/json", ...(body ? { "Content-Type": "application/json" } : {}), ...headers },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch {
      throw providerError("network error");
    }
    if (!res.ok) {
      const detail = (await res.json().catch(() => null)) as { error?: { description?: string } } | null;
      throw providerError(`Razorpay ${res.status}${detail?.error?.description ? `: ${detail.error.description}` : ""}`);
    }
    return (await res.json()) as T;
  };
  return {
    createOrder: (body) => call("POST", "/orders", body),
    fetchPayment: (paymentId) => call("GET", `/payments/${encodeURIComponent(paymentId)}`),
    capture: (paymentId, amount) => call("POST", `/payments/${encodeURIComponent(paymentId)}/capture`, { amount, currency: CURRENCY }),
    refund: (paymentId, amount, idempotencyKey) => call("POST", `/payments/${encodeURIComponent(paymentId)}/refund`, { amount, speed: "normal", receipt: idempotencyKey.slice(0, 40) }, { "X-Razorpay-Idempotency-Key": idempotencyKey }),
  };
}

const hmacHex = (secret: string, payload: string | Buffer): string => createHmac("sha256", secret).update(payload).digest("hex");

const safeEqualHex = (expected: string, received: unknown): boolean => {
  if (typeof received !== "string" || !/^[a-f0-9]{64}$/.test(received)) return false;
  return timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(received, "hex"));
};

export interface VerifiedRazorpayPayment {
  paymentId: string;
  amount: number;
  currency: string;
}

export class RazorpayGateway implements PaymentGateway {
  readonly method = "razorpay" as const;

  constructor(
    private readonly config: RazorpayConfig,
    private readonly api: RazorpayApi = razorpayHttpApi(config),
  ) {}

  get keyId(): string {
    return this.config.keyId;
  }

  async createPayment(order: PayableOrder): Promise<PaymentSetup> {
    const created = await this.api.createOrder({ amount: order.total, currency: CURRENCY, receipt: order.orderNumber, notes: { orderId: order.id, orderNumber: order.orderNumber } });
    return {
      providerOrderId: created.id,
      client: { method: "razorpay", keyId: this.config.keyId, razorpayOrderId: created.id, amount: order.total, currency: CURRENCY, orderNumber: order.orderNumber, prefill: { name: order.customer.name, email: order.customer.email, contact: order.customer.phone } },
    };
  }

  // The signature Razorpay Checkout hands the browser: HMAC-SHA256("<order_id>|<payment_id>", key secret).
  verifyCheckoutSignature(razorpayOrderId: string, paymentId: string, signature: unknown): boolean {
    return safeEqualHex(hmacHex(this.config.keySecret, `${razorpayOrderId}|${paymentId}`), signature);
  }

  // Webhooks are signed over the exact raw body with the webhook secret.
  verifyWebhookSignature(rawBody: Buffer, signature: unknown): boolean {
    return safeEqualHex(hmacHex(this.config.webhookSecret, rawBody), signature);
  }

  // A signature only proves which payment the browser claims; the API says whether money was actually taken.
  // Authorised-but-not-captured payments (manual capture accounts) are captured here.
  async confirmPayment(razorpayOrderId: string, paymentId: string, expectedAmount: number): Promise<VerifiedRazorpayPayment | null> {
    let payment = await this.api.fetchPayment(paymentId);
    if (payment.order_id !== razorpayOrderId) return null;
    if (payment.status === "authorized" && payment.amount === expectedAmount) payment = await this.api.capture(paymentId, payment.amount);
    if (payment.status !== "captured") return null;
    return { paymentId: payment.id, amount: payment.amount, currency: payment.currency };
  }

  async refund(paymentId: string, amount: number, idempotencyKey: string): Promise<RefundResult> {
    const refund = await this.api.refund(paymentId, amount, idempotencyKey);
    return { refundId: refund.id, status: refund.status === "processed" ? "processed" : "pending" };
  }

  // Razorpay orders cannot be cancelled; they simply stop being payable once we ignore them (late payments are refunded).
  cancelPayment(): Promise<void> {
    return Promise.resolve();
  }
}
