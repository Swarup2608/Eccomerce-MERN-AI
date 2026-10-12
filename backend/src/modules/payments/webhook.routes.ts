import { Router, type Request, type Response } from "express";
import { Schema, model } from "mongoose";
import type Stripe from "stripe";
import type { Logger } from "../../lib/logger.js";
import type { AuditRecorder } from "../audit/audit.service.js";
import type { OrderService } from "../orders/order.service.js";
import type { RazorpayGateway } from "./razorpay.js";
import type { StripeGateway } from "./stripe.js";

const WEBHOOK_RETENTION_SEC = 30 * 24 * 60 * 60;

// Gateways deliver at least once (and retry on any non-2xx), so each event id is processed only once.
const webhookEventSchema = new Schema({ provider: { type: String, required: true }, eventId: { type: String, required: true }, type: { type: String }, createdAt: { type: Date, default: () => new Date() } }, { versionKey: false });
webhookEventSchema.index({ provider: 1, eventId: 1 }, { unique: true });
webhookEventSchema.index({ createdAt: 1 }, { expireAfterSeconds: WEBHOOK_RETENTION_SEC });
export const WebhookEvent = model("WebhookEvent", webhookEventSchema);

interface RazorpayWebhook {
  event: string;
  payload: {
    payment?: { entity: { id: string; order_id: string; amount: number; currency: string; status: string; error_description?: string } };
    refund?: { entity: { id: string; status: string } };
  };
}

export interface WebhookDeps {
  orders: OrderService;
  razorpay: RazorpayGateway | undefined;
  stripe: StripeGateway | undefined;
  audit: AuditRecorder;
  logger: Logger;
}

// Mounted at /api/v1/webhooks with express.raw (signatures cover the exact bytes), before the JSON parser.
export function webhookRoutes({ orders, razorpay, stripe, audit, logger }: WebhookDeps): Router {
  const router = Router();
  const log = logger.child({ component: "webhooks" });

  // Records the event, runs the handler, and forgets the event again if the handler failed so the gateway's retry runs it.
  const once = async (res: Response, provider: string, eventId: string, type: string, handle: () => Promise<void>): Promise<void> => {
    try {
      await WebhookEvent.create({ provider, eventId, type });
    } catch (error) {
      if (typeof error === "object" && error !== null && "code" in error && error.code === 11000) {
        res.json({ received: true, duplicate: true });
        return;
      }
      throw error;
    }
    try {
      await handle();
    } catch (error) {
      await WebhookEvent.deleteOne({ provider, eventId });
      throw error;
    }
    res.json({ received: true });
  };

  const rejected = (req: Request, res: Response, provider: string): void => {
    audit.record("webhook_signature_invalid", { ip: req.ip, meta: { provider } });
    res.status(400).json({ error: { code: "INVALID_SIGNATURE", message: "Invalid signature" } });
  };

  router.post("/razorpay", async (req, res) => {
    if (!razorpay) return void res.status(404).end();
    const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    if (!razorpay.verifyWebhookSignature(raw, req.get("x-razorpay-signature"))) return rejected(req, res, "razorpay");

    const body = JSON.parse(raw.toString("utf8")) as RazorpayWebhook;
    const eventId = req.get("x-razorpay-event-id") ?? `${body.event}:${body.payload.payment?.entity.id ?? body.payload.refund?.entity.id ?? ""}`;
    await once(res, "razorpay", eventId, body.event, async () => {
      const payment = body.payload.payment?.entity;
      const refund = body.payload.refund?.entity;
      if (body.event === "payment.captured" && payment) {
        await orders.markPaid({ method: "razorpay", providerOrderId: payment.order_id, providerPaymentId: payment.id, amount: payment.amount, currency: payment.currency });
      } else if (body.event === "payment.failed" && payment) {
        await orders.markPaymentFailed("razorpay", payment.order_id, payment.error_description ?? "Payment failed");
      } else if ((body.event === "refund.processed" || body.event === "refund.failed") && refund) {
        await orders.updateRefundStatus(refund.id, body.event === "refund.processed" ? "processed" : "failed");
      } else log.debug("Ignored Razorpay event", { event: body.event });
    });
  });

  router.post("/stripe", async (req, res) => {
    if (!stripe) return void res.status(404).end();
    const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    const event = stripe.parseWebhook(raw, req.get("stripe-signature"));
    if (!event) return rejected(req, res, "stripe");

    await once(res, "stripe", event.id, event.type, async () => {
      switch (event.type) {
        case "checkout.session.completed":
        case "checkout.session.async_payment_succeeded": {
          const session = event.data.object as Stripe.Checkout.Session;
          // Delayed methods complete the session first and pay later (async_payment_succeeded).
          if (session.payment_status !== "paid") return;
          const paymentIntent = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id;
          if (!paymentIntent || session.amount_total === null) return;
          await orders.markPaid({ method: "stripe", providerOrderId: session.id, providerPaymentId: paymentIntent, amount: session.amount_total, currency: session.currency ?? "" });
          return;
        }
        case "checkout.session.async_payment_failed": {
          const session = event.data.object as Stripe.Checkout.Session;
          await orders.markPaymentFailed("stripe", session.id, "Payment failed");
          return;
        }
        case "checkout.session.expired": {
          const session = event.data.object as Stripe.Checkout.Session;
          await orders.expireCheckout("stripe", session.id);
          return;
        }
        case "refund.updated":
        case "refund.created": {
          const refund = event.data.object as Stripe.Refund;
          if (refund.status === "succeeded" || refund.status === "failed") await orders.updateRefundStatus(refund.id, refund.status === "succeeded" ? "processed" : "failed");
          return;
        }
        default:
          log.debug("Ignored Stripe event", { type: event.type });
      }
    });
  });

  return router;
}
