import { HttpError } from "../../lib/http-error.js";

export const PAYMENT_METHODS = ["razorpay", "stripe", "cod"] as const;

export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export type OnlineMethod = Exclude<PaymentMethod, "cod">;

export const CURRENCY = "INR";

// What a gateway needs to know about an order to take payment for it.
export interface PayableOrder {
  id: string;
  orderNumber: string;
  // Integer paise.
  total: number;
  shipping: number;
  items: { title: string; unitPrice: number; quantity: number }[];
  customer: { name: string; email: string; phone: string };
  // The checkout must not outlive the order's stock reservation.
  expiresAt: Date;
}

// Handed to the storefront so it can open the gateway's checkout.
export type PaymentClient =
  | { method: "razorpay"; keyId: string; razorpayOrderId: string; amount: number; currency: string; orderNumber: string; prefill: { name: string; email: string; contact: string } }
  | { method: "stripe"; url: string };

export interface PaymentSetup {
  // Razorpay order id or Stripe Checkout Session id; incoming payments are matched to the order through it.
  providerOrderId: string;
  client: PaymentClient;
}

export interface RefundResult {
  refundId: string;
  status: "pending" | "processed";
}

export interface PaymentGateway {
  readonly method: OnlineMethod;
  createPayment(order: PayableOrder): Promise<PaymentSetup>;
  // `providerPaymentId` is the Razorpay payment id or the Stripe PaymentIntent id. The key makes retries safe.
  refund(providerPaymentId: string, amount: number, idempotencyKey: string): Promise<RefundResult>;
  // Stops a not-yet-paid checkout from being completed (best effort; a late payment is refunded anyway).
  cancelPayment(providerOrderId: string): Promise<void>;
}

export const providerError = (cause: string): HttpError => new HttpError(502, "PAYMENT_PROVIDER_ERROR", `The payment provider could not be reached (${cause}). Please try again.`);

export const methodUnavailable = (method: string): HttpError => new HttpError(422, "PAYMENT_METHOD_UNAVAILABLE", `${method} is not available right now`, [{ path: "paymentMethod", message: "Not available" }]);
