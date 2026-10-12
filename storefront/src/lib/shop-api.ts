import { apiFetch, readJson } from "@/lib/api";
import { authFetch } from "@/lib/auth";
import type { ProductCardData, ProductImage } from "@/lib/catalog";

// Signed-in customer features. Everything goes through authFetch (cookie session, one transparent refresh).

export interface CartLine {
  productId: string;
  slug: string;
  title: string;
  brand: string;
  image: ProductImage | null;
  sku: string;
  options: Record<string, string>;
  unitPrice: number;
  compareAtPrice: number | null;
  quantity: number;
  lineTotal: number;
  available: number;
  status: "ok" | "unavailable" | "insufficient_stock";
}

export interface Cart {
  lines: CartLine[];
  itemCount: number;
  subtotal: number;
  hasIssues: boolean;
}

export interface Address {
  id: string;
  fullName: string;
  phone: string;
  line1: string;
  line2: string;
  landmark: string;
  city: string;
  state: string;
  postalCode: string;
  country: "IN";
  isDefault: boolean;
}

export type AddressInput = Omit<Address, "id" | "country">;

export type OrderStatus = "pending_payment" | "confirmed" | "processing" | "shipped" | "delivered" | "cancelled" | "returned";
export type PaymentMethod = "razorpay" | "stripe" | "cod";

export interface Order {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  statusHistory: { status: OrderStatus; at: string; note: string }[];
  items: { productId: string; slug: string; sku: string; title: string; brand: string; options: Record<string, string>; image: string | null; unitPrice: number; quantity: number; lineTotal: number }[];
  shippingAddress: Omit<Address, "id" | "isDefault">;
  pricing: { subtotal: number; shipping: number; discount: number; total: number };
  payment: { method: PaymentMethod; status: "pending" | "paid" | "failed" | "refunded" | "partially_refunded"; amountPaid: number; amountRefunded: number; refunds: { amount: number; status: string; createdAt: string }[] };
  tracking: { carrier: string; number: string; url: string } | null;
  cancelReason: string | null;
  expiresAt: string | null;
  canCancel: boolean;
  canPay: boolean;
  createdAt: string;
}

export type PaymentClient =
  | { method: "razorpay"; keyId: string; razorpayOrderId: string; amount: number; currency: string; orderNumber: string; prefill: { name: string; email: string; contact: string } }
  | { method: "stripe"; url: string };

export interface CheckoutConfig {
  currency: string;
  methods: PaymentMethod[];
  razorpayKeyId: string | null;
  shipping: { fee: number; freeFrom: number };
  codMaxTotal: number;
  paymentWindowMinutes: number;
}

export interface WishlistEntry {
  product: ProductCardData;
  available: boolean;
  addedAt: string;
}

const json = (method: string, body?: unknown): RequestInit => ({ method, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });

async function call<T>(path: `/${string}`, init?: RequestInit): Promise<T> {
  return readJson<T>(await authFetch(`/api/v1${path}`, init));
}

export const shopApi = {
  cart: () => call<{ cart: Cart }>("/cart").then((res) => res.cart),
  addToCart: (productId: string, sku: string, quantity: number) => call<{ cart: Cart }>("/cart/items", json("POST", { productId, sku, quantity })).then((res) => res.cart),
  setQuantity: (sku: string, quantity: number) => call<{ cart: Cart }>(`/cart/items/${encodeURIComponent(sku)}`, json("PATCH", { quantity })).then((res) => res.cart),
  removeFromCart: (sku: string) => call<{ cart: Cart }>(`/cart/items/${encodeURIComponent(sku)}`, json("DELETE")).then((res) => res.cart),
  mergeCart: (items: { productId: string; sku: string; quantity: number }[]) => call<{ cart: Cart }>("/cart/merge", json("POST", { items })).then((res) => res.cart),

  wishlist: () => call<{ items: WishlistEntry[] }>("/wishlist").then((res) => res.items),
  wishlistIds: () => call<{ productIds: string[] }>("/wishlist/ids").then((res) => res.productIds),
  addToWishlist: (productId: string) => call<void>(`/wishlist/${productId}`, json("PUT")),
  removeFromWishlist: (productId: string) => call<void>(`/wishlist/${productId}`, json("DELETE")),

  addresses: () => call<{ addresses: Address[] }>("/addresses").then((res) => res.addresses),
  createAddress: (input: AddressInput) => call<{ address: Address }>("/addresses", json("POST", input)).then((res) => res.address),
  updateAddress: (id: string, input: Partial<AddressInput>) => call<{ address: Address }>(`/addresses/${id}`, json("PATCH", input)).then((res) => res.address),
  deleteAddress: (id: string) => call<void>(`/addresses/${id}`, json("DELETE")),

  checkoutConfig: async () => readJson<CheckoutConfig>(await apiFetch("/api/v1/checkout/config")),
  placeOrder: (input: { addressId: string; paymentMethod: PaymentMethod; idempotencyKey: string }) => call<{ order: Order; payment: PaymentClient | null }>("/orders", json("POST", input)),
  orders: (page = 1) => call<{ items: Order[]; page: number; totalPages: number; total: number }>(`/orders?page=${page}&limit=10`),
  order: (id: string) => call<{ order: Order }>(`/orders/${id}`).then((res) => res.order),
  payOrder: (id: string) => call<{ order: Order; payment: PaymentClient | null }>(`/orders/${id}/pay`, json("POST")),
  verifyRazorpay: (id: string, body: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) => call<{ order: Order }>(`/orders/${id}/payments/razorpay/verify`, json("POST", body)).then((res) => res.order),
  cancelOrder: (id: string, reason: string) => call<{ order: Order }>(`/orders/${id}/cancel`, json("POST", { reason })).then((res) => res.order),
};

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  pending_payment: "Awaiting payment",
  confirmed: "Confirmed",
  processing: "Being packed",
  shipped: "Shipped",
  delivered: "Delivered",
  cancelled: "Cancelled",
  returned: "Returned",
};

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = { razorpay: "UPI, cards & netbanking (Razorpay)", stripe: "Card (Stripe)", cod: "Cash on Delivery" };

export const INDIAN_STATES = [
  "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chhattisgarh", "Goa", "Gujarat", "Haryana", "Himachal Pradesh", "Jharkhand", "Karnataka", "Kerala",
  "Madhya Pradesh", "Maharashtra", "Manipur", "Meghalaya", "Mizoram", "Nagaland", "Odisha", "Punjab", "Rajasthan", "Sikkim", "Tamil Nadu", "Telangana", "Tripura",
  "Uttar Pradesh", "Uttarakhand", "West Bengal", "Andaman and Nicobar Islands", "Chandigarh", "Dadra and Nagar Haveli and Daman and Diu", "Delhi", "Jammu and Kashmir",
  "Ladakh", "Lakshadweep", "Puducherry",
];
