import { randomInt, randomUUID } from "node:crypto";
import { Types, trusted } from "mongoose";
import { HttpError } from "../../lib/http-error.js";
import type { Logger } from "../../lib/logger.js";
import type { Mail, Mailer } from "../../lib/mailer.js";
import { escapeRegex, skipOf, toPage, type Page, type Pagination } from "../../lib/pagination.js";
import type { AddressService } from "../addresses/address.service.js";
import type { AuditRecorder } from "../audit/audit.service.js";
import { Cart } from "../cart/cart.model.js";
import type { CartService } from "../cart/cart.service.js";
import { CURRENCY, methodUnavailable, type OnlineMethod, type PaymentClient, type PaymentGateway, type PaymentMethod } from "../payments/gateway.js";
import type { RazorpayGateway } from "../payments/razorpay.js";
import { Product } from "../products/product.model.js";
import { LOW_STOCK_THRESHOLD } from "../products/product.service.js";
import { releaseStock, reserveStock } from "../products/stock.js";
import { User } from "../users/user.model.js";
import { orderCancelledEmail, orderConfirmedEmail, orderDeliveredEmail, orderShippedEmail, refundIssuedEmail } from "./order.emails.js";
import { Order, type ActorType, type IOrder, type IOrderItem, type IRefund, type OrderStatus, type PaymentStatus } from "./order.model.js";
import { ADMIN_TRANSITIONS, CUSTOMER_CANCELLABLE, COD_MAX_TOTAL, FREE_SHIPPING_FROM, PAYMENT_WINDOW_MS, SHIPPING_FEE, shippingFor } from "./order.policy.js";
import type { AdminOrdersQuery, CheckoutInput, RefundInput, UpdateStatusInput } from "./order.validation.js";

export type OrderDoc = IOrder & { _id: Types.ObjectId };

export interface CustomerOrder {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  statusHistory: { status: OrderStatus; at: Date; note: string }[];
  items: (Omit<IOrderItem, "product"> & { productId: string })[];
  shippingAddress: IOrder["shippingAddress"];
  pricing: IOrder["pricing"];
  currency: string;
  payment: { method: PaymentMethod; status: PaymentStatus; amountPaid: number; amountRefunded: number; refunds: Omit<IRefund, "refundId" | "reason">[] };
  tracking: IOrder["tracking"];
  cancelReason: string | null;
  expiresAt: Date | null;
  canCancel: boolean;
  canPay: boolean;
  createdAt: Date;
}

export interface AdminOrder extends Omit<CustomerOrder, "statusHistory" | "payment"> {
  userId: string;
  customer: IOrder["customer"];
  statusHistory: IOrder["statusHistory"];
  payment: IOrder["payment"];
  allowedTransitions: readonly OrderStatus[];
  refundable: number;
  stockReleased: boolean;
  updatedAt: Date;
}

export interface CheckoutResult {
  order: CustomerOrder;
  // Null for Cash on Delivery and for orders that no longer need paying.
  payment: PaymentClient | null;
}

export interface PaymentEvent {
  method: OnlineMethod;
  // How the gateway identifies the checkout (Razorpay order id / Stripe session id).
  providerOrderId: string;
  providerPaymentId: string;
  amount: number;
  currency: string;
}

export interface OrderStats {
  today: { orders: number; revenue: number };
  last30Days: { orders: number; revenue: number; daily: { date: string; orders: number; revenue: number }[] };
  awaitingPayment: number;
  toFulfil: number;
  lowStockProducts: number;
  recent: AdminOrder[];
}

export interface OrderServiceDeps {
  cart: CartService;
  addresses: AddressService;
  gateways: Partial<Record<OnlineMethod, PaymentGateway>>;
  mailer: Mailer;
  audit: AuditRecorder;
  logger: Logger;
  storefrontUrl: string;
}

const notFound = (): HttpError => new HttpError(404, "NOT_FOUND", "Order not found");

const isDuplicateKey = (error: unknown): error is { keyPattern?: Record<string, unknown> } => typeof error === "object" && error !== null && "code" in error && error.code === 11000;

// Unambiguous characters only (no 0/O, 1/I/L), so an order number can be read out over the phone.
const ORDER_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

function newOrderNumber(now = new Date()): string {
  const ist = new Date(now.getTime() + IST_OFFSET_MS).toISOString();
  const date = `${ist.slice(2, 4)}${ist.slice(5, 7)}${ist.slice(8, 10)}`;
  const suffix = Array.from({ length: 6 }, () => ORDER_ALPHABET[randomInt(ORDER_ALPHABET.length)]).join("");
  return `ORD-${date}-${suffix}`;
}

// Midnight in India, as a UTC instant.
const istStartOfDay = (now: Date): Date => new Date(Math.floor((now.getTime() + IST_OFFSET_MS) / 86_400_000) * 86_400_000 - IST_OFFSET_MS);

const historyEntry = (status: OrderStatus, by: ActorType, note = ""): IOrder["statusHistory"][number] => ({ status, at: new Date(), by, note });

const refundableOf = (order: Pick<IOrder, "payment">): number => (["paid", "partially_refunded"].includes(order.payment.status) ? order.payment.amountPaid - order.payment.amountRefunded : 0);

function toCustomerOrder(doc: OrderDoc, now = new Date()): CustomerOrder {
  return {
    id: doc._id.toString(),
    orderNumber: doc.orderNumber,
    status: doc.status,
    statusHistory: doc.statusHistory.map((entry) => ({ status: entry.status, at: entry.at, note: entry.by === "system" || entry.by === "customer" ? entry.note : "" })),
    items: doc.items.map(({ product, ...item }) => ({ ...item, productId: product.toString() })),
    shippingAddress: doc.shippingAddress,
    pricing: doc.pricing,
    currency: doc.currency,
    payment: { method: doc.payment.method, status: doc.payment.status, amountPaid: doc.payment.amountPaid, amountRefunded: doc.payment.amountRefunded, refunds: doc.payment.refunds.map((refund) => ({ amount: refund.amount, status: refund.status, createdAt: refund.createdAt })) },
    tracking: doc.tracking,
    cancelReason: doc.cancelReason,
    expiresAt: doc.expiresAt,
    canCancel: CUSTOMER_CANCELLABLE.includes(doc.status),
    canPay: doc.status === "pending_payment" && doc.payment.method !== "cod" && (doc.expiresAt?.getTime() ?? 0) > now.getTime(),
    createdAt: doc.createdAt,
  };
}

function toAdminOrder(doc: OrderDoc): AdminOrder {
  const { statusHistory: _history, payment: _payment, ...base } = toCustomerOrder(doc);
  return {
    ...base,
    userId: doc.user.toString(),
    customer: doc.customer,
    statusHistory: doc.statusHistory,
    payment: doc.payment,
    allowedTransitions: ADMIN_TRANSITIONS[doc.status],
    refundable: refundableOf(doc),
    stockReleased: doc.stockReleased,
    updatedAt: doc.updatedAt,
  };
}

export class OrderService {
  private readonly cart: CartService;
  private readonly addresses: AddressService;
  private readonly gateways: Partial<Record<OnlineMethod, PaymentGateway>>;
  private readonly mailer: Mailer;
  private readonly audit: AuditRecorder;
  private readonly logger: Logger;
  private readonly storefrontUrl: string;

  constructor(deps: OrderServiceDeps) {
    this.cart = deps.cart;
    this.addresses = deps.addresses;
    this.gateways = deps.gateways;
    this.mailer = deps.mailer;
    this.audit = deps.audit;
    this.logger = deps.logger;
    this.storefrontUrl = deps.storefrontUrl;
  }

  checkoutConfig() {
    const razorpay = this.gateways.razorpay as RazorpayGateway | undefined;
    return {
      currency: CURRENCY,
      methods: [...(razorpay ? ["razorpay" as const] : []), ...(this.gateways.stripe ? ["stripe" as const] : []), "cod" as const],
      razorpayKeyId: razorpay?.keyId ?? null,
      shipping: { fee: SHIPPING_FEE, freeFrom: FREE_SHIPPING_FROM },
      codMaxTotal: COD_MAX_TOTAL,
      paymentWindowMinutes: PAYMENT_WINDOW_MS / 60_000,
    };
  }

  // ---- Customer: checkout and payment ----

  // Prices come from the database, never the client. Stock is reserved before the order exists, and handed back if
  // anything after that fails, so an order always owns exactly the stock it shows.
  async checkout(userId: string, input: CheckoutInput): Promise<CheckoutResult> {
    const replay = await Order.findOne({ user: userId, idempotencyKey: input.idempotencyKey }).lean<OrderDoc>();
    if (replay) return this.resume(replay);

    const gateway = input.paymentMethod === "cod" ? undefined : this.gateways[input.paymentMethod];
    if (input.paymentMethod !== "cod" && !gateway) throw methodUnavailable(input.paymentMethod);

    const address = await this.addresses.get(userId, input.addressId).catch(() => {
      throw new HttpError(422, "INVALID_ADDRESS", "Choose a delivery address", [{ path: "addressId", message: "Address not found" }]);
    });
    const user = await User.findById(userId, { firstName: 1, lastName: 1, email: 1 }).lean();
    if (!user) throw new HttpError(401, "UNAUTHENTICATED", "Sign in to continue");

    const cart = await Cart.findOne({ user: userId }).lean();
    if (!cart || cart.items.length === 0) throw new HttpError(422, "CART_EMPTY", "Your cart is empty");
    const priced = await this.cart.price(cart.items);
    const problems = priced.filter((line) => line.status !== "ok");
    if (problems.length) {
      throw new HttpError(409, "CART_HAS_ISSUES", "Some items in your cart are unavailable or low on stock. Review your cart and try again.", problems.map((line) => ({ path: line.item.sku, message: line.status })));
    }

    const items: IOrderItem[] = priced.map(({ item, product, variant }) => {
      if (!product || !variant) throw new Error("priced line without product");
      return { product: product._id, slug: product.slug, sku: variant.sku, title: product.title, brand: product.brand, options: variant.options, image: product.images[0]?.url ?? null, unitPrice: variant.price, quantity: item.quantity, lineTotal: variant.price * item.quantity };
    });
    const subtotal = items.reduce((sum, item) => sum + item.lineTotal, 0);
    const shipping = shippingFor(subtotal);
    const total = subtotal + shipping;
    if (input.paymentMethod === "cod" && total > COD_MAX_TOTAL) throw new HttpError(422, "COD_LIMIT", "Cash on Delivery is not available for orders this large", [{ path: "paymentMethod", message: "Over the COD limit" }]);

    const shortfall = await reserveStock(items.map((item) => ({ product: item.product, sku: item.sku, quantity: item.quantity })));
    if (shortfall.length) throw new HttpError(409, "OUT_OF_STOCK", "An item in your cart just sold out. Review your cart and try again.", shortfall.map((sku) => ({ path: sku, message: "Out of stock" })));

    const isCod = input.paymentMethod === "cod";
    const now = new Date();
    let order: OrderDoc;
    try {
      order = await this.insertOrder({
        user: new Types.ObjectId(userId),
        customer: { name: `${user.firstName} ${user.lastName}`, email: user.email, phone: address.phone },
        idempotencyKey: input.idempotencyKey,
        items,
        shippingAddress: { fullName: address.fullName, phone: address.phone, line1: address.line1, line2: address.line2, landmark: address.landmark, city: address.city, state: address.state, postalCode: address.postalCode, country: address.country },
        pricing: { subtotal, shipping, discount: 0, total },
        currency: CURRENCY,
        payment: { method: input.paymentMethod, status: "pending", providerOrderId: null, providerPaymentId: null, checkoutUrl: null, amountPaid: 0, amountRefunded: 0, refunds: [], paidAt: null, lastError: null },
        status: isCod ? "confirmed" : "pending_payment",
        statusHistory: [historyEntry(isCod ? "confirmed" : "pending_payment", "customer")],
        tracking: null,
        cancelReason: null,
        stockReleased: false,
        expiresAt: isCod ? null : new Date(now.getTime() + PAYMENT_WINDOW_MS),
      });
    } catch (error) {
      await releaseStock(items);
      // Two identical requests raced: the other one created the order.
      if (isDuplicateKey(error) && error.keyPattern && "idempotencyKey" in error.keyPattern) {
        const winner = await Order.findOne({ user: userId, idempotencyKey: input.idempotencyKey }).lean<OrderDoc>();
        if (winner) return this.resume(winner);
      }
      throw error;
    }

    let payment: PaymentClient | null = null;
    if (gateway) {
      try {
        payment = await this.setUpPayment(order, gateway);
      } catch (error) {
        // Nothing was charged: give the stock back and leave the cart as it was so the customer can simply retry.
        await this.cancel({ _id: order._id }, ["pending_payment"], "system", "Payment could not be started");
        throw error;
      }
    }

    // Only the lines that were bought leave the cart (another tab may have added something meanwhile).
    await Cart.updateOne({ user: userId }, { $pull: { items: { sku: trusted({ $in: items.map((item) => item.sku) }) } } });
    this.audit.record("order_placed", { scope: "user", userId, meta: { orderId: order._id.toString(), orderNumber: order.orderNumber, total, method: input.paymentMethod } });
    if (isCod) this.send(orderConfirmedEmail(order, this.orderLink(order)));

    const fresh = await Order.findById(order._id).lean<OrderDoc>();
    return { order: toCustomerOrder(fresh ?? order), payment };
  }

  // Lets the customer reopen the gateway checkout for an order that is still waiting for payment.
  async pay(userId: string, orderId: string): Promise<CheckoutResult> {
    const order = await Order.findOne({ _id: orderId, user: userId }).lean<OrderDoc>();
    if (!order) throw notFound();
    const result = await this.resume(order);
    if (!result.payment) throw new HttpError(409, "NOT_PAYABLE", order.status === "pending_payment" ? "The time to pay for this order has run out" : "This order does not need paying");
    return result;
  }

  // The browser's Razorpay Checkout success callback. The signature proves which payment it claims; the payment is
  // then confirmed with Razorpay itself before the order is marked paid. The webhook does the same independently.
  async verifyRazorpay(userId: string, orderId: string, input: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }): Promise<CustomerOrder> {
    const gateway = this.gateways.razorpay as RazorpayGateway | undefined;
    if (!gateway) throw methodUnavailable("razorpay");
    const order = await Order.findOne({ _id: orderId, user: userId }).lean<OrderDoc>();
    if (!order) throw notFound();
    if (order.payment.method !== "razorpay" || order.payment.providerOrderId !== input.razorpay_order_id || !gateway.verifyCheckoutSignature(input.razorpay_order_id, input.razorpay_payment_id, input.razorpay_signature)) {
      this.audit.record("webhook_signature_invalid", { scope: "user", userId, meta: { source: "razorpay_checkout", orderId } });
      throw new HttpError(400, "INVALID_PAYMENT_SIGNATURE", "We could not verify this payment");
    }
    const confirmed = await gateway.confirmPayment(input.razorpay_order_id, input.razorpay_payment_id, order.pricing.total);
    if (!confirmed) throw new HttpError(402, "PAYMENT_NOT_CAPTURED", "The payment has not gone through yet. If money was deducted it will be confirmed shortly.");
    await this.markPaid({ method: "razorpay", providerOrderId: input.razorpay_order_id, providerPaymentId: confirmed.paymentId, amount: confirmed.amount, currency: confirmed.currency });
    return this.getForCustomer(userId, orderId);
  }

  // ---- Customer: viewing and cancelling ----

  async listForCustomer(userId: string, page: Pagination): Promise<Page<CustomerOrder>> {
    const filter = { user: userId };
    const [docs, total] = await Promise.all([Order.find(filter).sort({ createdAt: -1 }).skip(skipOf(page)).limit(page.limit).lean<OrderDoc[]>(), Order.countDocuments(filter)]);
    return toPage(docs.map((doc) => toCustomerOrder(doc)), total, page);
  }

  // Scoped by user: someone else's order id is simply "not found".
  async getForCustomer(userId: string, orderId: string): Promise<CustomerOrder> {
    const doc = await Order.findOne({ _id: orderId, user: userId }).lean<OrderDoc>();
    if (!doc) throw notFound();
    return toCustomerOrder(doc);
  }

  async cancelByCustomer(userId: string, orderId: string, reason: string): Promise<CustomerOrder> {
    const cancelled = await this.cancel({ _id: new Types.ObjectId(orderId), user: new Types.ObjectId(userId) }, CUSTOMER_CANCELLABLE, "customer", reason || "Cancelled by customer");
    if (!cancelled) {
      if (!(await Order.exists({ _id: orderId, user: userId }))) throw notFound();
      throw new HttpError(409, "NOT_CANCELLABLE", "This order can no longer be cancelled");
    }
    return toCustomerOrder(cancelled);
  }

  // ---- Payment events (Razorpay verify, Razorpay webhook, Stripe webhook) ----

  // Idempotent: the browser callback and the webhook may both deliver the same payment, in either order.
  async markPaid(event: PaymentEvent): Promise<void> {
    const order = await Order.findOne({ "payment.method": event.method, "payment.providerOrderId": event.providerOrderId }).lean<OrderDoc>();
    if (!order) {
      this.logger.warn("Payment for an unknown order", { method: event.method, providerOrderId: event.providerOrderId });
      return;
    }
    if (order.payment.providerPaymentId === event.providerPaymentId && order.payment.status !== "pending" && order.payment.status !== "failed") return;

    if (event.amount !== order.pricing.total || event.currency.toUpperCase() !== CURRENCY) {
      this.audit.record("payment_amount_mismatch", { meta: { orderId: order._id.toString(), expected: order.pricing.total, received: event.amount, currency: event.currency, providerPaymentId: event.providerPaymentId } });
      await Order.updateOne({ _id: order._id }, { $set: { "payment.lastError": `Amount mismatch: received ${event.amount} ${event.currency}` } });
      return;
    }

    const paid = { "payment.status": "paid", "payment.providerPaymentId": event.providerPaymentId, "payment.amountPaid": event.amount, "payment.paidAt": new Date(), "payment.lastError": null };
    const confirmed = await Order.findOneAndUpdate(
      { _id: order._id, status: "pending_payment", "payment.status": trusted({ $in: ["pending", "failed"] }) },
      { $set: { ...paid, status: "confirmed", expiresAt: null }, $push: { statusHistory: historyEntry("confirmed", "system", "Payment received") } },
      { returnDocument: "after" },
    ).lean<OrderDoc>();
    if (confirmed) {
      this.audit.record("payment_confirmed", { userId: order.user.toString(), meta: { orderId: order._id.toString(), method: event.method, amount: event.amount } });
      this.send(orderConfirmedEmail(confirmed, this.orderLink(confirmed)));
      return;
    }

    // The money arrived after the order was cancelled (payment window ran out, or the customer cancelled): its stock is
    // gone, so the payment is recorded and refunded in full straight away.
    const late = await Order.findOneAndUpdate({ _id: order._id, status: "cancelled", "payment.status": trusted({ $in: ["pending", "failed"] }) }, { $set: paid }, { returnDocument: "after" }).lean<OrderDoc>();
    if (late) {
      this.logger.warn("Payment received for a cancelled order; refunding", { orderId: order._id.toString() });
      await this.issueRefund(late, event.amount, "Payment received after the order was cancelled", "system").catch((error: unknown) => this.logger.error("Automatic refund failed", { orderId: order._id.toString(), error }));
    }
  }

  async markPaymentFailed(method: OnlineMethod, providerOrderId: string, reason: string): Promise<void> {
    // The order stays open: the customer can try another card until the payment window closes.
    await Order.updateOne({ "payment.method": method, "payment.providerOrderId": providerOrderId, "payment.status": "pending" }, { $set: { "payment.status": "failed", "payment.lastError": reason.slice(0, 300) } });
    this.audit.record("payment_failed", { meta: { method, providerOrderId } });
  }

  // A gateway reports that one of our refunds completed (or failed).
  async updateRefundStatus(refundId: string, status: IRefund["status"]): Promise<void> {
    await Order.updateOne({ "payment.refunds.refundId": refundId }, { $set: { "payment.refunds.$.status": status } });
  }

  // Stripe expired the Checkout Session: the order can no longer be paid, so its stock is released.
  async expireCheckout(method: OnlineMethod, providerOrderId: string): Promise<void> {
    const order = await Order.findOne({ "payment.method": method, "payment.providerOrderId": providerOrderId, status: "pending_payment" }, { _id: 1 }).lean();
    if (order) await this.cancel({ _id: order._id }, ["pending_payment"], "system", "Payment was not completed in time");
  }

  // Cancels unpaid online orders whose payment window has closed. Run periodically (see server.ts).
  async expireStale(now = new Date()): Promise<number> {
    const stale = await Order.find({ status: "pending_payment", expiresAt: trusted({ $lte: now }) }, { _id: 1 }).limit(100).lean();
    let count = 0;
    for (const order of stale) if (await this.cancel({ _id: order._id, status: "pending_payment" }, ["pending_payment"], "system", "Payment was not completed in time")) count += 1;
    return count;
  }

  // ---- Admin ----

  async adminList(query: AdminOrdersQuery): Promise<Page<AdminOrder>> {
    const filter: Record<string, unknown> = {};
    if (query.status) filter.status = query.status;
    if (query.paymentStatus) filter["payment.status"] = query.paymentStatus;
    if (query.paymentMethod) filter["payment.method"] = query.paymentMethod;
    if (query.from || query.to) filter.createdAt = trusted({ ...(query.from ? { $gte: query.from } : {}), ...(query.to ? { $lt: new Date(query.to.getTime() + 86_400_000) } : {}) });
    if (query.q) {
      const term = query.q.trim();
      filter.$or = [{ orderNumber: trusted({ $regex: new RegExp(`^${escapeRegex(term.toUpperCase())}`) }) }, { "customer.email": trusted({ $regex: new RegExp(`^${escapeRegex(term.toLowerCase())}`) }) }, { "customer.name": trusted({ $regex: new RegExp(escapeRegex(term), "i") }) }];
    }
    const [docs, total] = await Promise.all([Order.find(filter).sort({ createdAt: -1 }).skip(skipOf(query)).limit(query.limit).lean<OrderDoc[]>(), Order.countDocuments(filter)]);
    return toPage(docs.map(toAdminOrder), total, query);
  }

  async adminGet(orderId: string): Promise<AdminOrder> {
    const doc = await Order.findById(orderId).lean<OrderDoc>();
    if (!doc) throw notFound();
    return toAdminOrder(doc);
  }

  async listForUser(userId: string, limit = 20): Promise<AdminOrder[]> {
    const docs = await Order.find({ user: userId }).sort({ createdAt: -1 }).limit(limit).lean<OrderDoc[]>();
    return docs.map(toAdminOrder);
  }

  async updateStatus(orderId: string, input: UpdateStatusInput, actorId: string): Promise<AdminOrder> {
    const current = await Order.findById(orderId).lean<OrderDoc>();
    if (!current) throw notFound();
    if (!ADMIN_TRANSITIONS[current.status].includes(input.status)) throw new HttpError(409, "INVALID_TRANSITION", `An order that is ${current.status.replace("_", " ")} cannot be marked ${input.status.replace("_", " ")}`);

    let updated: OrderDoc | null;
    if (input.status === "cancelled") {
      updated = await this.cancel({ _id: current._id }, [current.status], "admin", input.note || "Cancelled by the store");
    } else {
      const set: Record<string, unknown> = { status: input.status };
      if (input.tracking) set.tracking = input.tracking;
      // Cash on Delivery is collected by the courier on delivery.
      if (input.status === "delivered" && current.payment.method === "cod" && current.payment.status === "pending") Object.assign(set, { "payment.status": "paid", "payment.amountPaid": current.pricing.total, "payment.paidAt": new Date() });
      updated = await Order.findOneAndUpdate({ _id: current._id, status: current.status }, { $set: set, $push: { statusHistory: historyEntry(input.status, "admin", input.note) } }, { returnDocument: "after" }).lean<OrderDoc>();
      if (updated && input.status === "returned") await this.releaseStockOnce(updated);
    }
    if (!updated) throw new HttpError(409, "EDIT_CONFLICT", "This order changed while you were looking at it. Reload and try again.");

    this.audit.record("order_status_changed", { scope: "admin", userId: actorId, meta: { orderId, from: current.status, to: input.status } });
    if (input.status === "shipped") this.send(orderShippedEmail(updated, this.orderLink(updated)));
    if (input.status === "delivered") this.send(orderDeliveredEmail(updated, this.orderLink(updated)));
    return toAdminOrder((await Order.findById(orderId).lean<OrderDoc>()) ?? updated);
  }

  async refund(orderId: string, input: RefundInput, actorId: string): Promise<AdminOrder> {
    const order = await Order.findById(orderId).lean<OrderDoc>();
    if (!order) throw notFound();
    const refundable = refundableOf(order);
    if (refundable <= 0) throw new HttpError(409, "NOT_REFUNDABLE", "There is nothing left to refund on this order");
    const amount = input.amount ?? refundable;
    if (amount > refundable) throw new HttpError(422, "REFUND_TOO_LARGE", `At most ${refundable} paise can be refunded`, [{ path: "amount", message: "Too large" }]);
    await this.issueRefund(order, amount, input.reason, "admin");
    this.audit.record("order_refunded", { scope: "admin", userId: actorId, meta: { orderId, amount } });
    return this.adminGet(orderId);
  }

  async stats(now = new Date()): Promise<OrderStats> {
    const today = istStartOfDay(now);
    const since = new Date(today.getTime() - 29 * 86_400_000);
    const counted: Record<string, unknown> = { status: trusted({ $nin: ["pending_payment", "cancelled"] }) };
    const [daily, awaitingPayment, toFulfil, lowStockProducts, recent] = await Promise.all([
      Order.aggregate<{ _id: string; orders: number; revenue: number }>([
        { $match: { createdAt: { $gte: since }, status: { $nin: ["pending_payment", "cancelled"] } } },
        { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt", timezone: "+05:30" } }, orders: { $sum: 1 }, revenue: { $sum: { $subtract: ["$pricing.total", "$payment.amountRefunded"] } } } },
        { $sort: { _id: 1 } },
      ]),
      Order.countDocuments({ status: "pending_payment" }),
      Order.countDocuments({ status: trusted({ $in: ["confirmed", "processing"] }) }),
      Product.countDocuments({ status: "active", variants: trusted({ $elemMatch: { isActive: true, stock: { $lte: LOW_STOCK_THRESHOLD } } }) }),
      Order.find(counted).sort({ createdAt: -1 }).limit(8).lean<OrderDoc[]>(),
    ]);
    const byDay = new Map(daily.map((row) => [row._id, row]));
    const days = Array.from({ length: 30 }, (_, index) => new Date(since.getTime() + index * 86_400_000 + IST_OFFSET_MS).toISOString().slice(0, 10));
    const series = days.map((date) => ({ date, orders: byDay.get(date)?.orders ?? 0, revenue: byDay.get(date)?.revenue ?? 0 }));
    const todayRow = series[series.length - 1] ?? { orders: 0, revenue: 0 };
    return {
      today: { orders: todayRow.orders, revenue: todayRow.revenue },
      last30Days: { orders: series.reduce((sum, day) => sum + day.orders, 0), revenue: series.reduce((sum, day) => sum + day.revenue, 0), daily: series },
      awaitingPayment,
      toFulfil,
      lowStockProducts,
      recent: recent.map(toAdminOrder),
    };
  }

  async productHasOrders(productId: string): Promise<boolean> {
    return Boolean(await Order.exists({ "items.product": productId }));
  }

  // ---- Internals ----

  private async insertOrder(fields: Omit<IOrder, "orderNumber" | "createdAt" | "updatedAt">): Promise<OrderDoc> {
    for (let attempt = 0; ; attempt += 1) {
      try {
        return (await Order.create({ ...fields, orderNumber: newOrderNumber() })).toObject() as OrderDoc;
      } catch (error) {
        if (attempt < 3 && isDuplicateKey(error) && error.keyPattern && "orderNumber" in error.keyPattern) continue;
        throw error;
      }
    }
  }

  private async setUpPayment(order: OrderDoc, gateway: PaymentGateway): Promise<PaymentClient> {
    const setup = await gateway.createPayment({
      id: order._id.toString(),
      orderNumber: order.orderNumber,
      total: order.pricing.total,
      shipping: order.pricing.shipping,
      items: order.items.map((item) => ({ title: Object.values(item.options).length ? `${item.title} (${Object.values(item.options).join(", ")})` : item.title, unitPrice: item.unitPrice, quantity: item.quantity })),
      customer: order.customer,
      expiresAt: order.expiresAt ?? new Date(Date.now() + PAYMENT_WINDOW_MS),
    });
    await Order.updateOne({ _id: order._id }, { $set: { "payment.providerOrderId": setup.providerOrderId, "payment.checkoutUrl": setup.client.method === "stripe" ? setup.client.url : null } });
    return setup.client;
  }

  // The current state of an order plus, if it still needs paying, how to pay for it.
  private async resume(order: OrderDoc): Promise<CheckoutResult> {
    const view = toCustomerOrder(order);
    if (!view.canPay) return { order: view, payment: null };
    const method = order.payment.method as OnlineMethod;
    const gateway = this.gateways[method];
    if (!gateway) throw methodUnavailable(method);
    // A Razorpay order accepts any number of attempts and a Stripe session stays open until the order expires, so both
    // are reused; a new one is only created if the first setup never finished.
    if (method === "razorpay" && order.payment.providerOrderId) {
      const razorpay = gateway as RazorpayGateway;
      return { order: view, payment: { method: "razorpay", keyId: razorpay.keyId, razorpayOrderId: order.payment.providerOrderId, amount: order.pricing.total, currency: CURRENCY, orderNumber: order.orderNumber, prefill: { name: order.customer.name, email: order.customer.email, contact: order.customer.phone } } };
    }
    if (method === "stripe" && order.payment.checkoutUrl) return { order: view, payment: { method: "stripe", url: order.payment.checkoutUrl } };
    return { order: view, payment: await this.setUpPayment(order, gateway) };
  }

  // The single way an order gets cancelled: one atomic status change (so it happens once), then the stock goes back,
  // an open checkout is closed, and anything already paid is refunded.
  private async cancel(filter: Record<string, unknown>, from: readonly OrderStatus[], by: ActorType, reason: string): Promise<OrderDoc | null> {
    const cancelled = await Order.findOneAndUpdate(
      { ...filter, status: trusted({ $in: [...from] }) },
      { $set: { status: "cancelled", cancelReason: reason, expiresAt: null }, $push: { statusHistory: historyEntry("cancelled", by, reason) } },
      { returnDocument: "after" },
    ).lean<OrderDoc>();
    if (!cancelled) return null;

    await this.releaseStockOnce(cancelled);
    const gateway = cancelled.payment.method === "cod" ? undefined : this.gateways[cancelled.payment.method];
    if (gateway && cancelled.payment.status === "pending" && cancelled.payment.providerOrderId) {
      await gateway.cancelPayment(cancelled.payment.providerOrderId).catch((error: unknown) => this.logger.warn("Could not close the checkout", { orderId: cancelled._id.toString(), error }));
    }

    const refundable = refundableOf(cancelled);
    if (refundable > 0) {
      await this.issueRefund(cancelled, refundable, reason, by).catch((error: unknown) => {
        // The cancellation stands; the admin sees the unrefunded balance and can retry from the order page.
        this.logger.error("Refund on cancellation failed", { orderId: cancelled._id.toString(), error });
      });
    }
    this.audit.record("order_cancelled", { scope: by === "admin" ? "admin" : by === "customer" ? "user" : undefined, userId: cancelled.user.toString(), meta: { orderId: cancelled._id.toString(), by, reason } });
    if (by !== "system" || cancelled.payment.status !== "pending") this.send(orderCancelledEmail(cancelled, this.orderLink(cancelled), refundable));
    return (await Order.findById(cancelled._id).lean<OrderDoc>()) ?? cancelled;
  }

  private async releaseStockOnce(order: OrderDoc): Promise<void> {
    const claimed = await Order.updateOne({ _id: order._id, stockReleased: false }, { $set: { stockReleased: true } });
    if (claimed.modifiedCount === 1) await releaseStock(order.items);
  }

  // Reserves the amount on the order first (an atomic check that refunds never exceed what was paid, even with two
  // admins clicking at once), then asks the gateway. A gateway failure gives the reservation back.
  private async issueRefund(order: OrderDoc, amount: number, reason: string, by: ActorType): Promise<void> {
    const reserved = await Order.findOneAndUpdate(
      { _id: order._id, "payment.status": trusted({ $in: ["paid", "partially_refunded"] }), $expr: trusted({ $lte: [{ $add: ["$payment.amountRefunded", amount] }, "$payment.amountPaid"] }) },
      { $inc: { "payment.amountRefunded": amount } },
      { returnDocument: "before" },
    ).lean<OrderDoc>();
    if (!reserved) throw new HttpError(409, "NOT_REFUNDABLE", "This refund is larger than the remaining paid amount");

    let refund: Pick<IRefund, "refundId" | "status">;
    try {
      if (reserved.payment.method === "cod") {
        // Cash was collected by the courier, so the money goes back outside the system; this records it.
        refund = { refundId: `manual_${randomUUID()}`, status: "processed" };
      } else {
        const gateway = this.gateways[reserved.payment.method];
        if (!gateway || !reserved.payment.providerPaymentId) throw methodUnavailable(reserved.payment.method);
        refund = await gateway.refund(reserved.payment.providerPaymentId, amount, `refund-${reserved._id.toString()}-${reserved.payment.amountRefunded}`);
      }
    } catch (error) {
      await Order.updateOne({ _id: order._id }, { $inc: { "payment.amountRefunded": -amount } });
      throw error;
    }

    const refunded = reserved.payment.amountRefunded + amount;
    await Order.updateOne(
      { _id: order._id },
      { $set: { "payment.status": refunded >= reserved.payment.amountPaid ? "refunded" : "partially_refunded" }, $push: { "payment.refunds": { refundId: refund.refundId, amount, status: refund.status, reason, createdAt: new Date() } } },
    );
    this.audit.record("order_refunded", { userId: order.user.toString(), meta: { orderId: order._id.toString(), amount, by } });
    if (order.status !== "cancelled" && !reason.startsWith("Payment received after")) this.send(refundIssuedEmail(order, this.orderLink(order), amount));
  }

  private orderLink(order: Pick<OrderDoc, "_id">): string {
    return `${this.storefrontUrl}/account/orders/${order._id.toString()}`;
  }

  // Emails never fail the request that triggered them.
  private send(mail: Mail): void {
    this.mailer.send(mail).catch((error: unknown) => this.logger.error("Order email failed", { subject: mail.subject, error }));
  }
}
