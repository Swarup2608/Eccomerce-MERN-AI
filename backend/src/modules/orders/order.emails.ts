import type { Mail } from "../../lib/mailer.js";
import type { IOrder } from "./order.model.js";

export const formatInr = (paise: number): string => `₹${(paise / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

type OrderLike = Pick<IOrder, "orderNumber" | "customer" | "items" | "pricing" | "shippingAddress" | "payment">;

const lines = (order: OrderLike): string =>
  order.items.map((item) => `- ${item.title}${Object.values(item.options).length ? ` (${Object.values(item.options).join(", ")})` : ""} x ${item.quantity}: ${formatInr(item.lineTotal)}`).join("\n");

const firstName = (order: OrderLike): string => order.customer.name.split(" ")[0] ?? order.customer.name;

export const orderConfirmedEmail = (order: OrderLike, link: string): Mail => ({
  to: order.customer.email,
  subject: `Order ${order.orderNumber} confirmed`,
  text: [
    `Hi ${firstName(order)},`,
    "",
    `Thanks for your order! ${order.payment.method === "cod" ? "Please keep the amount ready for payment on delivery." : "We have received your payment."}`,
    "",
    lines(order),
    "",
    `Subtotal: ${formatInr(order.pricing.subtotal)}`,
    `Shipping: ${order.pricing.shipping ? formatInr(order.pricing.shipping) : "Free"}`,
    `Total: ${formatInr(order.pricing.total)}`,
    "",
    `Shipping to: ${order.shippingAddress.fullName}, ${order.shippingAddress.line1}, ${order.shippingAddress.city} ${order.shippingAddress.postalCode}`,
    "",
    `Track your order: ${link}`,
  ].join("\n"),
});

export const orderShippedEmail = (order: OrderLike & Pick<IOrder, "tracking">, link: string): Mail => ({
  to: order.customer.email,
  subject: `Order ${order.orderNumber} has shipped`,
  text: `Hi ${firstName(order)},\n\nYour order is on its way${order.tracking ? ` with ${order.tracking.carrier} (tracking number ${order.tracking.number})` : ""}.${order.tracking?.url ? `\n\nCourier tracking: ${order.tracking.url}` : ""}\n\nOrder details: ${link}`,
});

export const orderDeliveredEmail = (order: OrderLike, link: string): Mail => ({
  to: order.customer.email,
  subject: `Order ${order.orderNumber} was delivered`,
  text: `Hi ${firstName(order)},\n\nYour order has been delivered. We hope you love it!\n\nOrder details: ${link}`,
});

export const orderCancelledEmail = (order: OrderLike, link: string, refundAmount: number): Mail => ({
  to: order.customer.email,
  subject: `Order ${order.orderNumber} was cancelled`,
  text: `Hi ${firstName(order)},\n\nYour order has been cancelled.${refundAmount > 0 ? ` A refund of ${formatInr(refundAmount)} has been started and usually reaches your account in 5-7 working days.` : ""}\n\nOrder details: ${link}`,
});

export const refundIssuedEmail = (order: OrderLike, link: string, amount: number): Mail => ({
  to: order.customer.email,
  subject: `Refund for order ${order.orderNumber}`,
  text: `Hi ${firstName(order)},\n\nWe have issued a refund of ${formatInr(amount)} for your order. It usually reaches your account in 5-7 working days.\n\nOrder details: ${link}`,
});
