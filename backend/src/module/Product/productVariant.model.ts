import { Schema, model } from "mongoose";

export interface IProductVariant {
    productId: Schema.Types.ObjectId;
    attributes: Map<string, string>;
    variantKey: string;
    isDefault: boolean;
    createdAt?: Date;
    updatedAt?: Date;
}

export function buildVariantKey(attributes: Map<string, string> | Record<string, string>): string {
    const entries = attributes instanceof Map ? Array.from(attributes.entries()) : Object.entries(attributes);
    return entries.map(([key, value]) => [key.trim().toLowerCase(), value.trim().toLowerCase()]).sort(([keyA], [keyB]) => keyA.localeCompare(keyB)).map(([key, value]) => `${encodeURIComponent(key)}:${encodeURIComponent(value)}`).join('|');
}

const productVariantSchema = new Schema<IProductVariant>({
    productId: { type: Schema.Types.ObjectId, ref: "Product", required: true },
    attributes: { type: Map, of: String, required: true, validate: {
        validator: (value: Map<string, string>) => value.size > 0,
        message: "Attributes map must contain at least one entry.",
    }},
    variantKey: { type: String, required: true, trim: true },
    isDefault: { type: Boolean, default: false, required: true },
},{
    timestamps: true,
    versionKey: false,
});

productVariantSchema.index({ productId: 1, variantKey: 1 }, { unique: true });
productVariantSchema.index({ productId: 1 }, { unique: true, partialFilterExpression: { isDefault: true } });

export const ProductVariant = model<IProductVariant>("ProductVariant", productVariantSchema);