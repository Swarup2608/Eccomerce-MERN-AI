import type { ObjectStorage } from "../lib/storage.js";
import type { Logger } from "../lib/logger.js";
import type { AuditRecorder } from "./audit/audit.service.js";
import { Category } from "./categories/category.model.js";
import { CategoryService } from "./categories/category.service.js";
import { Product } from "./products/product.model.js";
import { ProductService } from "./products/product.service.js";
import { Upload } from "./uploads/upload.model.js";
import { UploadService } from "./uploads/upload.service.js";

export interface CommerceDeps {
  logger: Logger;
  audit: AuditRecorder;
  // Undefined when R2 is not configured: image uploads then answer 503.
  storage: ObjectStorage | undefined;
}

export interface CommerceServices {
  uploads: UploadService;
  categories: CategoryService;
  products: ProductService;
  // Products that appear in an order are archived instead of deleted.
  productHasOrders(productId: string): Promise<boolean>;
}

// One place that builds the shop's services, shared by the server and the integration tests.
export function createCommerce({ logger, audit, storage }: CommerceDeps): CommerceServices {
  const uploads = new UploadService(storage, logger.child({ component: "uploads" }));
  const categories = new CategoryService(audit);
  const products = new ProductService({ categories, uploads, audit });
  return { uploads, categories, products, productHasOrders: () => Promise.resolve(false) };
}

// Unique indexes (slugs, SKUs, one cart per user...) are correctness guarantees, so they are built even when autoIndex is off.
export const COMMERCE_MODELS = [Upload, Category, Product] as const;
