import { Schema, model } from "mongoose";

export interface IVendorProductVariant {
    vendorProductId: Schema.Types.ObjectId;
    productVariantId: Schema.Types.ObjectId;
    sellerSku: string;
    price: number;
    compareAtPrice?: number;
    createdAt?: Date;
    updatedAt?: Date;
}

const vendorProductVariantSchema = new Schema<IVendorProductVariant>({
    vendorProductId: { type: Schema.Types.ObjectId, ref: "VendorProduct", required: true },
    productVariantId: { type: Schema.Types.ObjectId, ref: "ProductVariant", required: true },
    sellerSku: { type: String, required: true, trim: true, uppercase: true, maxlength: 100 },
    price: { type: Number, required: true, min: 0 },
    compareAtPrice: { type: Number, min: 0, validate: {
        validator: function (this: IVendorProductVariant, value: number | undefined) {
            return value === undefined || value >= this.price;
        } as (value: number | undefined) => boolean,
        message: "Compare-at price must be greater than or equal to the selling price.",
    }},
},{
    timestamps: true,
    versionKey: false,
});

vendorProductVariantSchema.index({ vendorProductId: 1, productVariantId: 1 }, { unique: true });
vendorProductVariantSchema.index({ sellerSku: 1 }, { unique: true });
vendorProductVariantSchema.index({ price: 1 });

export const VendorProductVariant = model<IVendorProductVariant>("VendorProductVariant", vendorProductVariantSchema);
