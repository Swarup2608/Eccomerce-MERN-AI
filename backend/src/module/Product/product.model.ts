import { Schema, model } from "mongoose";

export const PRODUCT_STATUSES = {
    DRAFT: "draft",
    ACTIVE: "active",
    ARCHIVED: "archived",
} as const;

export type ProductStatus = (typeof PRODUCT_STATUSES)[keyof typeof PRODUCT_STATUSES];

export interface IProduct {
    name: string;
    slug: string;
    description: string;
    shortDescription?: string;
    brand?: string;
    categoryId: Schema.Types.ObjectId;
    images: {
        url: string;
        alt?: string;
        isPrimary: boolean;
        sortOrder: number;
    }[];
    attributes: Map<string, string>;
    status: ProductStatus;
    createdAt?: Date;
    updatedAt?: Date;
}

const productSchema = new Schema<IProduct>({
    name: { type: String, required: true, trim: true, maxlength: 200 },
    slug: { type: String, required: true, trim: true, unique: true, maxlength: 220, lowercase: true },
    description: { type: String, required: true, trim: true, maxlength: 10000 },
    shortDescription: { type: String, trim: true, maxlength: 500 },
    brand: { type: String, trim: true, maxlength: 100 },
    categoryId: { type: Schema.Types.ObjectId, ref: "Category", required: true },
    images: {
        type: [{
            _id: false,
            url: {type: String, required: true, trim: true},
            alt: {type: String, trim: true, maxlength: 200},
            isPrimary: {type: Boolean, default: false},
            sortOrder: {type: Number, default: 0, min: 0},
        }],
        default: [],
    },
    attributes: {type: Map, of: String, default: {}},
    status: { type: String, enum: Object.values(PRODUCT_STATUSES), default: PRODUCT_STATUSES.DRAFT, required: true },
},{
    timestamps: true,
    versionKey: false,
});

productSchema.index({ slug: 1 }, { unique: true });
productSchema.index({ name: "text", description: "text" });
productSchema.index({ categoryId: 1, status: 1 });
productSchema.index({ brand: 1, status: 1 });

export const Product  = model<IProduct>("Product", productSchema);