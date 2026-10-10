import { Schema, model } from "mongoose";

export const INVENTORY_TRANSACTION_TYPES = {
    STOCK_IN: "stock_in",
    STOCK_OUT: "stock_out",
    RESERVE: "reserve",
    RELEASE: "release",
    ADJUSTMENT: "adjustment",
    RETURN: "return",
} as const;

export type InventoryTransactionType = (typeof INVENTORY_TRANSACTION_TYPES)[keyof typeof INVENTORY_TRANSACTION_TYPES];

export interface IInventoryTransaction {
    inventoryId: Schema.Types.ObjectId;
    type: InventoryTransactionType;
    quantity: number;
    referenceId?: Schema.Types.ObjectId;
    reason?: string;
    performedBy?: Schema.Types.ObjectId;
    createdAt?: Date;
}

const inventoryTransactionSchema = new Schema<IInventoryTransaction>({
    inventoryId: { type: Schema.Types.ObjectId, ref: "Inventory", required: true },
    type: { type: String, enum: Object.values(INVENTORY_TRANSACTION_TYPES), required: true },
    quantity: { type: Number, required: true, min: 1, validate: {
        validator: Number.isSafeInteger,
        message: "Transaction quantity must be a safe integer.",
    }},
    referenceId: { type: Schema.Types.ObjectId, default: null },
    reason: { type: String, trim: true, maxlength: 500 },
    performedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
},{
    timestamps: { createdAt: true, updatedAt: false },
    versionKey: false,
});

inventoryTransactionSchema.index({ inventoryId: 1, createdAt: -1 });
inventoryTransactionSchema.index({ referenceId: 1, type: 1 });

export const InventoryTransaction = model<IInventoryTransaction>("InventoryTransaction", inventoryTransactionSchema);
