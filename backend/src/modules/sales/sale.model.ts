import { Schema, model, type Types } from "mongoose";

export const DISCOUNT_TYPES = ["percent", "fixed"] as const;
export type DiscountType = (typeof DISCOUNT_TYPES)[number];

// What a sale discounts: the whole catalogue, every product under some categories (and their sub-categories), or a hand-picked list.
export const SALE_SCOPES = ["all", "categories", "products"] as const;
export type SaleScope = (typeof SALE_SCOPES)[number];

// Derived from isActive and the schedule; never stored.
export const SALE_STATUSES = ["live", "scheduled", "ended", "disabled"] as const;
export type SaleStatus = (typeof SALE_STATUSES)[number];

export interface ISale {
  name: string;
  slug: string;
  description: string;
  discountType: DiscountType;
  // Whole percent (1-90) or integer paise off each unit.
  discountValue: number;
  appliesTo: SaleScope;
  categories: Types.ObjectId[];
  products: Types.ObjectId[];
  startsAt: Date;
  endsAt: Date;
  // The admin's on/off switch; a sale is live only while switched on and inside its schedule.
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const saleSchema = new Schema<ISale>(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    slug: { type: String, required: true, trim: true, lowercase: true, maxlength: 120 },
    description: { type: String, default: "", maxlength: 300 },
    discountType: { type: String, enum: DISCOUNT_TYPES, required: true },
    discountValue: { type: Number, required: true, min: 1 },
    appliesTo: { type: String, enum: SALE_SCOPES, required: true },
    categories: { type: [Schema.Types.ObjectId], ref: "Category", default: [] },
    products: { type: [Schema.Types.ObjectId], ref: "Product", default: [] },
    startsAt: { type: Date, required: true },
    endsAt: { type: Date, required: true },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true, versionKey: false },
);

saleSchema.index({ slug: 1 }, { unique: true });
saleSchema.index({ isActive: 1, endsAt: 1, startsAt: 1 });

export const Sale = model<ISale>("Sale", saleSchema);
