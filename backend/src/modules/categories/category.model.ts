import { Schema, model, type Types } from "mongoose";
import { ATTRIBUTE_TYPES, type AttributeDef } from "./category.validation.js";

export interface ICategory {
  name: string;
  slug: string;
  description: string;
  parent: Types.ObjectId | null;
  // Root first. Lets a listing for "Clothing" include products from "Clothing > Men > Shirts" with one index lookup.
  ancestors: Types.ObjectId[];
  isActive: boolean;
  sortOrder: number;
  // Only this category's own attributes; children inherit their ancestors' (see effectiveAttributes).
  attributes: AttributeDef[];
  createdAt?: Date;
  updatedAt?: Date;
}

const attributeDefSchema = new Schema<AttributeDef>(
  {
    key: { type: String, required: true },
    label: { type: String, required: true },
    type: { type: String, enum: ATTRIBUTE_TYPES, required: true },
    options: { type: [String], default: [] },
    unit: { type: String },
    required: { type: Boolean, default: false },
    filterable: { type: Boolean, default: false },
    variantAxis: { type: Boolean, default: false },
  },
  { _id: false },
);

const categorySchema = new Schema<ICategory>(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    slug: { type: String, required: true, trim: true, lowercase: true, maxlength: 120 },
    description: { type: String, default: "", maxlength: 2000 },
    parent: { type: Schema.Types.ObjectId, ref: "Category", default: null },
    ancestors: { type: [Schema.Types.ObjectId], default: [] },
    isActive: { type: Boolean, default: true },
    sortOrder: { type: Number, default: 0 },
    attributes: { type: [attributeDefSchema], default: [] },
  },
  { timestamps: true, versionKey: false },
);

categorySchema.index({ slug: 1 }, { unique: true });
categorySchema.index({ parent: 1, sortOrder: 1 });
categorySchema.index({ ancestors: 1 });

export const Category = model<ICategory>("Category", categorySchema);
