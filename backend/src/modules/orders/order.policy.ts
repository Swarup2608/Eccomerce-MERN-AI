import type { OrderStatus } from "./order.model.js";

// All amounts are integer paise. Prices already include GST, so there is no separate tax line.
export const FREE_SHIPPING_FROM = 49_900;
export const SHIPPING_FEE = 4_900;
// Cash on Delivery is limited to smaller orders, as most couriers require.
export const COD_MAX_TOTAL = 5_000_000;
// How long an online order holds its stock while the customer pays. Stripe needs at least 30 minutes.
export const PAYMENT_WINDOW_MS = 45 * 60 * 1000;

export const shippingFor = (subtotal: number): number => (subtotal >= FREE_SHIPPING_FROM ? 0 : SHIPPING_FEE);

// The order lifecycle the admin drives. Cancelling a paid order refunds it; "returned" puts the stock back.
export const ADMIN_TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  pending_payment: ["cancelled"],
  confirmed: ["processing", "cancelled"],
  processing: ["shipped", "cancelled"],
  shipped: ["delivered"],
  delivered: ["returned"],
  cancelled: [],
  returned: [],
};

// Customers can cancel until the parcel leaves the warehouse.
export const CUSTOMER_CANCELLABLE: readonly OrderStatus[] = ["pending_payment", "confirmed", "processing"];

// Statuses whose stock is still reserved; leaving them for cancelled/returned gives it back.
export const RELEASES_STOCK: readonly OrderStatus[] = ["cancelled", "returned"];
