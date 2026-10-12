import { Schema, model, type Types } from "mongoose";

export const MAX_CART_LINES = 50;
export const MAX_LINE_QUANTITY = 10;

export interface ICartItem {
  product: Types.ObjectId;
  sku: string;
  quantity: number;
  addedAt: Date;
}

// Only references and quantities: prices, names and stock are read live from the product on every view and at checkout.
export interface ICart {
  user: Types.ObjectId;
  items: ICartItem[];
  createdAt?: Date;
  updatedAt?: Date;
}

const cartItemSchema = new Schema<ICartItem>(
  {
    product: { type: Schema.Types.ObjectId, ref: "Product", required: true },
    sku: { type: String, required: true },
    quantity: { type: Number, required: true, min: 1, max: MAX_LINE_QUANTITY },
    addedAt: { type: Date, default: () => new Date() },
  },
  { _id: false },
);

const cartSchema = new Schema<ICart>(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true },
    items: { type: [cartItemSchema], default: [], validate: [(items: ICartItem[]) => items.length <= MAX_CART_LINES, `A cart holds at most ${MAX_CART_LINES} lines`] },
  },
  { timestamps: true, versionKey: false },
);

cartSchema.index({ user: 1 }, { unique: true });

export const Cart = model<ICart>("Cart", cartSchema);
