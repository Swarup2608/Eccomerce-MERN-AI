"use client";

import { shopApi, type Order, type PaymentClient } from "@/lib/shop-api";

const RAZORPAY_SCRIPT = "https://checkout.razorpay.com/v1/checkout.js";

interface RazorpayResponse {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}

interface RazorpayInstance {
  open(): void;
  on(event: "payment.failed", handler: () => void): void;
}

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => RazorpayInstance;
  }
}

let scriptLoading: Promise<void> | null = null;

// Added from our own (nonce-trusted) bundle, which the CSP's 'strict-dynamic' allows.
function loadRazorpay(): Promise<void> {
  if (window.Razorpay) return Promise.resolve();
  scriptLoading ??= new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = RAZORPAY_SCRIPT;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      scriptLoading = null;
      reject(new Error("Could not load Razorpay. Check your connection and try again."));
    };
    document.head.appendChild(script);
  });
  return scriptLoading;
}

export type PaymentOutcome = "paid" | "dismissed" | "redirecting";

// Opens the gateway for an order. Razorpay pays in a popup on this page (then the payment is verified with the API);
// Stripe hosts its own page and sends the customer back to the order page, where the webhook has confirmed it.
export async function startPayment(order: Order, payment: PaymentClient): Promise<PaymentOutcome> {
  if (payment.method === "stripe") {
    window.location.assign(payment.url);
    return "redirecting";
  }
  await loadRazorpay();
  const Razorpay = window.Razorpay;
  if (!Razorpay) throw new Error("Razorpay is unavailable");
  return new Promise<PaymentOutcome>((resolve, reject) => {
    const checkout = new Razorpay({
      key: payment.keyId,
      order_id: payment.razorpayOrderId,
      amount: payment.amount,
      currency: payment.currency,
      name: "Storefront",
      description: `Order ${payment.orderNumber}`,
      prefill: payment.prefill,
      theme: { color: "#171717" },
      handler: (response: RazorpayResponse) => {
        shopApi.verifyRazorpay(order.id, response).then(() => resolve("paid"), reject);
      },
      modal: { ondismiss: () => resolve("dismissed"), confirm_close: true },
    });
    checkout.open();
  });
}
