import { Schema, model, type Types } from "mongoose";

export const PRODUCT_STATUSES = ["draft", "active", "archived"] as const;

export type ProductStatus = (typeof PRODUCT_STATUSES)[number];

export type AttributeValue = string | number | boolean | string[];

export interface IVariant {
  sku: string;
  // One value per variant axis of the category, e.g. { size: "M", color: "Black" }. Empty for a product without axes.
  options: Record<string, string>;
  // Integer paise.
  price: number;
  compareAtPrice?: number | null;
  stock: number;
  isActive: boolean;
}

export interface IProductImage {
  key: string;
  url: string;
  alt: string;
}

export interface IProduct {
  title: string;
  slug: string;
  description: string;
  brand: string;
  category: Types.ObjectId;
  // The category's ancestors plus the category itself, so a parent category lists its descendants' products.
  categoryPath: Types.ObjectId[];
  // Validated against the category's attribute definitions by the service.
  attributes: Record<string, AttributeValue>;
  variants: IVariant[];
  images: IProductImage[];
  tags: string[];
  status: ProductStatus;
  isFeatured: boolean;
  // Denormalised on every save for listing, sorting and filtering.
  minPrice: number;
  maxPrice: number;
  totalStock: number;
  // "key:value" strings for every filterable attribute, variant option and the brand; one multikey index serves all filters.
  facets: string[];
  createdAt?: Date;
  updatedAt?: Date;
}

const variantSchema = new Schema<IVariant>(
  {
    sku: { type: String, required: true, trim: true, uppercase: true, maxlength: 64 },
    options: { type: Schema.Types.Mixed, default: {} },
    price: { type: Number, required: true, min: 0 },
    compareAtPrice: { type: Number, default: null },
    stock: { type: Number, required: true, min: 0 },
    isActive: { type: Boolean, default: true },
  },
  { _id: false, minimize: false },
);

const imageSchema = new Schema<IProductImage>({ key: { type: String, required: true }, url: { type: String, required: true }, alt: { type: String, default: "" } }, { _id: false });

const productSchema = new Schema<IProduct>(
  {
    title: { type: String, required: true, trim: true, maxlength: 200 },
    slug: { type: String, required: true, trim: true, lowercase: true, maxlength: 120 },
    description: { type: String, default: "", maxlength: 10_000 },
    brand: { type: String, default: "", trim: true, maxlength: 60 },
    category: { type: Schema.Types.ObjectId, ref: "Category", required: true },
    categoryPath: { type: [Schema.Types.ObjectId], default: [] },
    attributes: { type: Schema.Types.Mixed, default: {} },
    variants: { type: [variantSchema], required: true },
    images: { type: [imageSchema], default: [] },
    tags: { type: [String], default: [] },
    status: { type: String, enum: PRODUCT_STATUSES, default: "draft", required: true },
    isFeatured: { type: Boolean, default: false },
    minPrice: { type: Number, required: true, min: 0 },
    maxPrice: { type: Number, required: true, min: 0 },
    totalStock: { type: Number, required: true, min: 0 },
    facets: { type: [String], default: [] },
  },
  { timestamps: true, versionKey: false, minimize: false },
);

productSchema.index({ slug: 1 }, { unique: true });
productSchema.index({ "variants.sku": 1 }, { unique: true });
productSchema.index({ status: 1, categoryPath: 1, minPrice: 1 });
productSchema.index({ status: 1, createdAt: -1 });
productSchema.index({ status: 1, isFeatured: 1, createdAt: -1 });
productSchema.index({ status: 1, facets: 1 });
productSchema.index({ category: 1 });
productSchema.index({ title: "text", brand: "text", tags: "text", description: "text" }, { weights: { title: 10, brand: 5, tags: 3, description: 1 }, name: "product_text" });

export const Product = model<IProduct>("Product", productSchema);
