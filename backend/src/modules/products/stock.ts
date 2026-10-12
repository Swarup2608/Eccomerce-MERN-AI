import { trusted, type Types } from "mongoose";
import { Product } from "./product.model.js";

export interface StockLine {
  product: Types.ObjectId;
  sku: string;
  quantity: number;
}

// Takes stock for every line or for none. Each line is one conditional update that only matches while the variant is
// active and has enough stock, so two checkouts racing for the last unit cannot both win (no transaction needed).
// If a later line fails, the lines already taken are put back. Returns the SKUs that could not be reserved.
export async function reserveStock(lines: readonly StockLine[]): Promise<string[]> {
  const taken: StockLine[] = [];
  for (const line of lines) {
    const result = await Product.updateOne(
      { _id: line.product, status: "active", variants: trusted({ $elemMatch: { sku: line.sku, isActive: true, stock: { $gte: line.quantity } } }) },
      { $inc: { "variants.$.stock": -line.quantity, totalStock: -line.quantity } },
    );
    if (result.modifiedCount !== 1) {
      await releaseStock(taken);
      return [line.sku];
    }
    taken.push(line);
  }
  return [];
}

// The inverse of reserveStock. Callers guard it with the order's `stockReleased` flag so it runs at most once per order.
export async function releaseStock(lines: readonly StockLine[]): Promise<void> {
  for (const line of lines) {
    await Product.updateOne({ _id: line.product, "variants.sku": line.sku }, { $inc: { "variants.$.stock": line.quantity, totalStock: line.quantity } });
  }
}
