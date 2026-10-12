import { Schema, model, type Types } from "mongoose";
import { PAYMENT_METHODS, type PaymentMethod } from "../payments/gateway.js";

export const ORDER_STATUSES = ["pending_payment", "confirmed", "processing", "shipped", "delivered", "cancelled", "returned"] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const PAYMENT_STATUSES = ["pending", "paid", "failed", "refunded", "partially_refunded"] as const;

export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export type ActorType = "customer" | "admin" | "system";

export interface IOrderItem {
  product: Types.ObjectId;
  slug: string;
  sku: string;
  title: string;
  brand: string;
  options: Record<string, string>;
  image: string | null;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
}

export interface IShippingAddress {
  fullName: string;
  phone: string;
  line1: string;
  line2: string;
  landmark: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
}

export interface IRefund {
  refundId: string;
  amount: number;
  status: "pending" | "processed" | "failed";
  reason: string;
  createdAt: Date;
}

export interface IPayment {
  method: PaymentMethod;
  status: PaymentStatus;
  // Razorpay order id or Stripe Checkout Session id.
  providerOrderId: string | null;
  // Razorpay payment id or Stripe PaymentIntent id, once paid.
  providerPaymentId: string | null;
  // Where the customer resumes an unfinished Stripe checkout.
  checkoutUrl: string | null;
  amountPaid: number;
  amountRefunded: number;
  refunds: IRefund[];
  paidAt: Date | null;
  lastError: string | null;
}

export interface IStatusChange {
  status: OrderStatus;
  at: Date;
  by: ActorType;
  note: string;
}

export interface IOrder {
  orderNumber: string;
  user: Types.ObjectId;
  // Snapshot at checkout, so emails and admin search work without joining users.
  customer: { name: string; email: string; phone: string };
  idempotencyKey: string;
  items: IOrderItem[];
  shippingAddress: IShippingAddress;
  pricing: { subtotal: number; shipping: number; discount: number; total: number };
  currency: "INR";
  payment: IPayment;
  status: OrderStatus;
  statusHistory: IStatusChange[];
  tracking: { carrier: string; number: string; url: string } | null;
  cancelReason: string | null;
  // Set once the reserved stock has been put back, so it is never returned twice.
  stockReleased: boolean;
  // Unpaid online orders give their stock back after this.
  expiresAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const itemSchema = new Schema<IOrderItem>(
  {
    product: { type: Schema.Types.ObjectId, ref: "Product", required: true },
    slug: { type: String, required: true },
    sku: { type: String, required: true },
    title: { type: String, required: true },
    brand: { type: String, default: "" },
    options: { type: Schema.Types.Mixed, default: {} },
    image: { type: String, default: null },
    unitPrice: { type: Number, required: true, min: 0 },
    quantity: { type: Number, required: true, min: 1 },
    lineTotal: { type: Number, required: true, min: 0 },
  },
  { _id: false, minimize: false },
);

const addressSchema = new Schema<IShippingAddress>(
  { fullName: String, phone: String, line1: String, line2: String, landmark: String, city: String, state: String, postalCode: String, country: String },
  { _id: false },
);

const refundSchema = new Schema<IRefund>(
  { refundId: { type: String, required: true }, amount: { type: Number, required: true }, status: { type: String, enum: ["pending", "processed", "failed"], required: true }, reason: { type: String, default: "" }, createdAt: { type: Date, default: () => new Date() } },
  { _id: false },
);

const paymentSchema = new Schema<IPayment>(
  {
    method: { type: String, enum: PAYMENT_METHODS, required: true },
    status: { type: String, enum: PAYMENT_STATUSES, default: "pending", required: true },
    providerOrderId: { type: String, default: null },
    providerPaymentId: { type: String, default: null },
    checkoutUrl: { type: String, default: null },
    amountPaid: { type: Number, default: 0 },
    amountRefunded: { type: Number, default: 0 },
    refunds: { type: [refundSchema], default: [] },
    paidAt: { type: Date, default: null },
    lastError: { type: String, default: null },
  },
  { _id: false },
);

const trackingSchema = new Schema<NonNullable<IOrder["tracking"]>>({ carrier: String, number: String, url: String }, { _id: false });

const orderSchema = new Schema<IOrder>(
  {
    orderNumber: { type: String, required: true },
    user: { type: Schema.Types.ObjectId, ref: "User", required: true },
    customer: { name: String, email: String, phone: String },
    idempotencyKey: { type: String, required: true },
    items: { type: [itemSchema], required: true },
    shippingAddress: { type: addressSchema, required: true },
    pricing: { subtotal: Number, shipping: Number, discount: Number, total: Number },
    currency: { type: String, enum: ["INR"], default: "INR" },
    payment: { type: paymentSchema, required: true },
    status: { type: String, enum: ORDER_STATUSES, required: true },
    statusHistory: { type: [{ _id: false, status: String, at: Date, by: String, note: String }], default: [] },
    tracking: { type: trackingSchema, default: null },
    cancelReason: { type: String, default: null },
    stockReleased: { type: Boolean, default: false },
    expiresAt: { type: Date, default: null },
  },
  { timestamps: true, versionKey: false },
);

orderSchema.index({ orderNumber: 1 }, { unique: true });
orderSchema.index({ user: 1, idempotencyKey: 1 }, { unique: true });
orderSchema.index({ user: 1, createdAt: -1 });
orderSchema.index({ createdAt: -1 });
orderSchema.index({ status: 1, createdAt: -1 });
orderSchema.index({ "payment.status": 1, createdAt: -1 });
orderSchema.index({ "customer.email": 1 });
orderSchema.index({ "items.product": 1 });
orderSchema.index({ "payment.providerOrderId": 1 }, { partialFilterExpression: { "payment.providerOrderId": { $type: "string" } } });
orderSchema.index({ expiresAt: 1 }, { partialFilterExpression: { status: "pending_payment" } });

export const Order = model<IOrder>("Order", orderSchema);
