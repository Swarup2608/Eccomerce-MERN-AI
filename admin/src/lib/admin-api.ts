import { ApiError, readJson } from "@/lib/api";
import { authFetch } from "@/lib/auth";

// Typed wrappers for the admin API. Every call goes through authFetch (cookie session, one transparent refresh).

export type AttributeType = "text" | "number" | "boolean" | "select" | "multiselect";

export interface AttributeDef {
  key: string;
  label: string;
  type: AttributeType;
  options: string[];
  unit?: string;
  required: boolean;
  filterable: boolean;
  variantAxis: boolean;
}

export interface Category {
  id: string;
  name: string;
  slug: string;
  description: string;
  parentId: string | null;
  ancestorIds: string[];
  isActive: boolean;
  sortOrder: number;
  attributes: AttributeDef[];
}

export interface CategoryNode extends Category {
  children: CategoryNode[];
}

export interface CategoryDetail extends Category {
  effectiveAttributes: AttributeDef[];
  breadcrumbs: { name: string; slug: string }[];
}

export type CategoryInput = Pick<Category, "name" | "description" | "parentId" | "isActive" | "sortOrder" | "attributes"> & { slug?: string };

export type ProductStatus = "draft" | "active" | "archived";
export type AttributeValue = string | number | boolean | string[];

export interface Variant {
  sku: string;
  options: Record<string, string>;
  price: number;
  compareAtPrice: number | null;
  stock: number;
  isActive: boolean;
}

export interface ProductImage {
  key: string;
  url: string;
  alt: string;
}

export interface Product {
  id: string;
  title: string;
  slug: string;
  description: string;
  brand: string;
  categoryId: string;
  attributes: Record<string, AttributeValue>;
  variants: Variant[];
  images: ProductImage[];
  tags: string[];
  status: ProductStatus;
  isFeatured: boolean;
  minPrice: number;
  maxPrice: number;
  totalStock: number;
  createdAt: string;
  updatedAt: string;
}

export interface ProductInput {
  title: string;
  slug?: string;
  description: string;
  brand: string;
  categoryId: string;
  attributes: Record<string, AttributeValue>;
  variants: Variant[];
  images: { key: string; alt: string }[];
  tags: string[];
  status: ProductStatus;
  isFeatured: boolean;
}

export interface Page<T> {
  items: T[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export type OrderStatus = "pending_payment" | "confirmed" | "processing" | "shipped" | "delivered" | "cancelled" | "returned";
export type PaymentStatus = "pending" | "paid" | "failed" | "refunded" | "partially_refunded";
export type PaymentMethod = "razorpay" | "stripe" | "cod";

export interface OrderItem {
  productId: string;
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

export interface Order {
  id: string;
  orderNumber: string;
  userId: string;
  customer: { name: string; email: string; phone: string };
  status: OrderStatus;
  statusHistory: { status: OrderStatus; at: string; by: "customer" | "admin" | "system"; note: string }[];
  items: OrderItem[];
  shippingAddress: { fullName: string; phone: string; line1: string; line2: string; landmark: string; city: string; state: string; postalCode: string; country: string };
  pricing: { subtotal: number; shipping: number; discount: number; total: number };
  payment: {
    method: PaymentMethod;
    status: PaymentStatus;
    providerOrderId: string | null;
    providerPaymentId: string | null;
    amountPaid: number;
    amountRefunded: number;
    refunds: { refundId: string; amount: number; status: string; reason: string; createdAt: string }[];
    paidAt: string | null;
    lastError: string | null;
  };
  tracking: { carrier: string; number: string; url: string } | null;
  cancelReason: string | null;
  expiresAt: string | null;
  allowedTransitions: OrderStatus[];
  refundable: number;
  createdAt: string;
  updatedAt: string;
}

export interface Stats {
  today: { orders: number; revenue: number };
  last30Days: { orders: number; revenue: number; daily: { date: string; orders: number; revenue: number }[] };
  awaitingPayment: number;
  toFulfil: number;
  lowStockProducts: number;
  recent: Order[];
}

export interface Customer {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  userName: string;
  phoneNumber: string | null;
  status: "active" | "inactive" | "suspended" | "deleted";
  emailVerified: boolean;
  createdAt: string;
  lastLoginAt: string | null;
}

export interface CustomerDetail extends Customer {
  orderCount: number;
  totalSpent: number;
  orders: Order[];
}

export interface UploadTicket {
  key: string;
  uploadUrl: string;
  headers: Record<string, string>;
  publicUrl: string;
}

const BASE = "/api/v1/admin";

const json = (method: string, body?: unknown): RequestInit => ({ method, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });

async function call<T>(path: `/${string}`, init?: RequestInit): Promise<T> {
  return readJson<T>(await authFetch(`${BASE}${path}`, init));
}

// Drops empty values so the API's strict query validation never sees `?status=`.
export function query(params: Record<string, string | number | boolean | undefined | null>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value !== undefined && value !== null && value !== "" && value !== false) search.set(key, String(value));
  const text = search.toString();
  return text ? `?${text}` : "";
}

export const adminApi = {
  stats: () => call<{ stats: Stats }>("/stats").then((res) => res.stats),

  categories: () => call<{ categories: Category[]; tree: CategoryNode[] }>("/categories"),
  category: (id: string) => call<{ category: CategoryDetail }>(`/categories/${id}`).then((res) => res.category),
  createCategory: (input: CategoryInput) => call<{ category: CategoryDetail }>("/categories", json("POST", input)).then((res) => res.category),
  updateCategory: (id: string, input: Partial<CategoryInput>) => call<{ category: CategoryDetail }>(`/categories/${id}`, json("PATCH", input)).then((res) => res.category),
  deleteCategory: (id: string) => call<void>(`/categories/${id}`, json("DELETE")),

  products: (params: { q?: string; status?: string; categoryId?: string; lowStock?: boolean; page?: number; limit?: number }) => call<Page<Product>>(`/products${query(params)}` as `/${string}`),
  product: (id: string) => call<{ product: Product }>(`/products/${id}`).then((res) => res.product),
  createProduct: (input: ProductInput) => call<{ product: Product }>("/products", json("POST", input)).then((res) => res.product),
  updateProduct: (id: string, input: Partial<ProductInput>) => call<{ product: Product }>(`/products/${id}`, json("PATCH", input)).then((res) => res.product),
  setProductStatus: (id: string, status: ProductStatus) => call<{ product: Product }>(`/products/${id}/status`, json("PATCH", { status })).then((res) => res.product),
  adjustStock: (id: string, sku: string, change: { stock: number } | { delta: number }) => call<{ product: Product }>(`/products/${id}/variants/${encodeURIComponent(sku)}/stock`, json("PATCH", change)).then((res) => res.product),
  deleteProduct: (id: string) => call<{ archived: boolean }>(`/products/${id}`, json("DELETE")),

  createUpload: (contentType: string, size: number) => call<{ upload: UploadTicket }>("/uploads/images", json("POST", { contentType, size })).then((res) => res.upload),

  orders: (params: { q?: string; status?: string; paymentStatus?: string; paymentMethod?: string; from?: string; to?: string; page?: number; limit?: number }) => call<Page<Order>>(`/orders${query(params)}` as `/${string}`),
  order: (id: string) => call<{ order: Order }>(`/orders/${id}`).then((res) => res.order),
  updateOrderStatus: (id: string, input: { status: OrderStatus; note?: string; tracking?: { carrier: string; number: string; url: string } }) => call<{ order: Order }>(`/orders/${id}/status`, json("PATCH", input)).then((res) => res.order),
  refundOrder: (id: string, input: { amount?: number; reason: string }) => call<{ order: Order }>(`/orders/${id}/refund`, json("POST", input)).then((res) => res.order),

  customers: (params: { q?: string; status?: string; page?: number; limit?: number }) => call<Page<Customer>>(`/customers${query(params)}` as `/${string}`),
  customer: (id: string) => call<{ customer: CustomerDetail }>(`/customers/${id}`).then((res) => res.customer),
  setCustomerStatus: (id: string, status: "active" | "suspended") => call<{ customer: CustomerDetail }>(`/customers/${id}/status`, json("PATCH", { status })).then((res) => res.customer),
};

// Uploads a file straight to R2 with the presigned URL, then returns the key to attach to the product.
export async function uploadImage(file: File): Promise<{ key: string; url: string }> {
  const ticket = await adminApi.createUpload(file.type, file.size);
  let res: Response;
  try {
    res = await fetch(ticket.uploadUrl, { method: "PUT", headers: ticket.headers, body: file });
  } catch {
    // The browser hides why a cross-origin request failed; for R2 it is nearly always the bucket's CORS rule or the CSP.
    throw new ApiError(0, "UPLOAD_BLOCKED", "The image storage refused the upload. Check the R2 bucket's CORS policy allows PUT from this admin origin.");
  }
  if (!res.ok) throw new ApiError(res.status, "UPLOAD_FAILED", `The image storage rejected the upload (HTTP ${res.status}). Try again, or pick a smaller image.`);
  return { key: ticket.key, url: ticket.publicUrl };
}

// Flattens the category tree into select options, indented by depth.
export function flattenTree(nodes: CategoryNode[], depth = 0): { category: Category; depth: number }[] {
  return nodes.flatMap((node) => [{ category: node, depth }, ...flattenTree(node.children, depth + 1)]);
}

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  pending_payment: "Awaiting payment",
  confirmed: "Confirmed",
  processing: "Processing",
  shipped: "Shipped",
  delivered: "Delivered",
  cancelled: "Cancelled",
  returned: "Returned",
};

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  pending: "Pending",
  paid: "Paid",
  failed: "Failed",
  refunded: "Refunded",
  partially_refunded: "Partly refunded",
};

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = { razorpay: "Razorpay", stripe: "Stripe", cod: "Cash on Delivery" };
