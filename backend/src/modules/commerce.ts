import type { ObjectStorage } from "../lib/storage.js";
import type { Logger } from "../lib/logger.js";
import type { Mailer } from "../lib/mailer.js";
import { Order } from "./orders/order.model.js";
import { OrderService } from "./orders/order.service.js";
import type { RazorpayGateway } from "./payments/razorpay.js";
import type { StripeGateway } from "./payments/stripe.js";
import { WebhookEvent } from "./payments/webhook.routes.js";
import type { AuditRecorder } from "./audit/audit.service.js";
import { Category } from "./categories/category.model.js";
import { CategoryService } from "./categories/category.service.js";
import { Product } from "./products/product.model.js";
import { ProductService } from "./products/product.service.js";
import { Upload } from "./uploads/upload.model.js";
import { Address, AddressService } from "./addresses/address.service.js";
import { Cart } from "./cart/cart.model.js";
import { CartService } from "./cart/cart.service.js";
import { WishlistItem, WishlistService } from "./wishlist/wishlist.service.js";
import { UploadService } from "./uploads/upload.service.js";

export interface CommerceDeps {
  logger: Logger;
  audit: AuditRecorder;
  // Undefined when R2 is not configured: image uploads then answer 503.
  storage: ObjectStorage | undefined;
  mailer: Mailer;
  storefrontUrl: string;
  // Each gateway is undefined when it is not configured; Cash on Delivery is always available.
  payments: { razorpay?: RazorpayGateway; stripe?: StripeGateway };
}

export interface CommerceServices {
  uploads: UploadService;
  categories: CategoryService;
  products: ProductService;
  cart: CartService;
  wishlist: WishlistService;
  addresses: AddressService;
  orders: OrderService;
  payments: CommerceDeps["payments"];
  // Products that appear in an order are archived instead of deleted.
  productHasOrders(productId: string): Promise<boolean>;
}

// One place that builds the shop's services, shared by the server and the integration tests.
export function createCommerce({ logger, audit, storage, mailer, storefrontUrl, payments }: CommerceDeps): CommerceServices {
  const uploads = new UploadService(storage, logger.child({ component: "uploads" }));
  const categories = new CategoryService(audit);
  const products = new ProductService({ categories, uploads, audit });
  const cart = new CartService(products);
  const addresses = new AddressService();
  const orders = new OrderService({ cart, addresses, gateways: payments, mailer, audit, logger: logger.child({ component: "orders" }), storefrontUrl });
  return { uploads, categories, products, cart, wishlist: new WishlistService(products), addresses, orders, payments, productHasOrders: (productId) => orders.productHasOrders(productId) };
}

// Unique indexes (slugs, SKUs, one cart per user...) are correctness guarantees, so they are built even when autoIndex is off.
export const COMMERCE_MODELS = [Upload, Category, Product, Cart, WishlistItem, Address, Order, WebhookEvent] as const;
