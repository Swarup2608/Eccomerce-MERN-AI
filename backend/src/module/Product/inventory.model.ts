import { Schema, Types, model } from "mongoose";

export interface IInventory {
    vendorProductVariantId: Types.ObjectId;
    quantity: number;
    reservedQuantity: number;
    createdAt?: Date;
    updatedAt?: Date;
}

const inventorySchema = new Schema<IInventory>({
    vendorProductVariantId: { type: Schema.Types.ObjectId, ref: "VendorProductVariant", required: true },
    quantity: { type: Number, required: true, default: 0, min: 0, validate: {
        validator: Number.isSafeInteger,
        message: "Quantity must be a safe integer.",
    }},
    reservedQuantity: { type: Number, required: true, default: 0, min: 0, validate: {
        validator: Number.isSafeInteger,
        message: "Reserved quantity must be a safe integer.",
    }},
},{
    timestamps: true,
    versionKey: false,
});

// Each vendor variant has exactly one inventory record.
inventorySchema.index({ vendorProductVariantId: 1 }, { unique: true });

inventorySchema.virtual("availableQuantity").get(function () {
    return this.quantity - this.reservedQuantity;
});

export const Inventory = model<IInventory>("Inventory", inventorySchema);
