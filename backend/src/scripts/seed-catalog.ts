import { loadConfig } from "../config/env.js";
import { createLogger } from "../lib/logger.js";
import { connectMongo, disconnectMongo } from "../lib/mongo.js";
import { Category } from "../modules/categories/category.model.js";
import { CategoryService } from "../modules/categories/category.service.js";
import { createCategorySchema, type AttributeDef } from "../modules/categories/category.validation.js";
import { Product } from "../modules/products/product.model.js";
import { ProductService } from "../modules/products/product.service.js";
import { createProductSchema } from "../modules/products/product.validation.js";
import { UploadService } from "../modules/uploads/upload.service.js";

// Starter category tree with per-category attributes. Safe to re-run: existing slugs are left alone.
//   npm run seed:catalog -w backend
//   SEED_SAMPLE_PRODUCTS=true npm run seed:catalog -w backend   (also adds a few draft-free sample products, no images)

type Attr = Partial<AttributeDef> & Pick<AttributeDef, "key" | "label" | "type">;

interface SeedCategory {
  name: string;
  slug: string;
  description: string;
  attributes: Attr[];
  children?: SeedCategory[];
}

const APPAREL_SIZES = ["XS", "S", "M", "L", "XL", "XXL"];
const COLORS = ["Black", "White", "Grey", "Navy", "Blue", "Red", "Green", "Beige", "Brown", "Pink", "Yellow"];

const TREE: SeedCategory[] = [
  {
    name: "Clothing",
    slug: "clothing",
    description: "Everyday wear and occasion outfits.",
    attributes: [
      { key: "size", label: "Size", type: "select", options: APPAREL_SIZES, variantAxis: true, filterable: true, required: true },
      { key: "color", label: "Colour", type: "select", options: COLORS, variantAxis: true, filterable: true, required: true },
      { key: "material", label: "Material", type: "select", options: ["Cotton", "Linen", "Polyester", "Wool", "Denim", "Silk", "Rayon", "Blend"], filterable: true, required: true },
      { key: "fit", label: "Fit", type: "select", options: ["Slim", "Regular", "Relaxed", "Oversized"], filterable: true },
      { key: "care", label: "Care instructions", type: "text" },
    ],
    children: [
      { name: "Men", slug: "men", description: "Menswear.", attributes: [], children: [
        { name: "Shirts", slug: "men-shirts", description: "", attributes: [{ key: "sleeve", label: "Sleeve", type: "select", options: ["Short", "Long", "Roll-up"], filterable: true }, { key: "collar", label: "Collar", type: "select", options: ["Spread", "Button-down", "Mandarin", "Cuban"] }] },
        { name: "T-Shirts", slug: "men-t-shirts", description: "", attributes: [{ key: "neck", label: "Neck", type: "select", options: ["Crew", "V-neck", "Polo", "Henley"], filterable: true }] },
        { name: "Jeans", slug: "men-jeans", description: "", attributes: [{ key: "rise", label: "Rise", type: "select", options: ["Low", "Mid", "High"], filterable: true }, { key: "stretch", label: "Stretch", type: "boolean", filterable: true }] },
      ] },
      { name: "Women", slug: "women", description: "Womenswear.", attributes: [], children: [
        { name: "Dresses", slug: "women-dresses", description: "", attributes: [{ key: "length", label: "Length", type: "select", options: ["Mini", "Midi", "Maxi"], filterable: true }, { key: "occasion", label: "Occasion", type: "multiselect", options: ["Casual", "Party", "Work", "Festive"], filterable: true }] },
        { name: "Tops", slug: "women-tops", description: "", attributes: [{ key: "sleeve", label: "Sleeve", type: "select", options: ["Sleeveless", "Short", "Three-quarter", "Long"], filterable: true }] },
        { name: "Kurtas", slug: "women-kurtas", description: "", attributes: [{ key: "length", label: "Length", type: "select", options: ["Short", "Knee", "Calf", "Ankle"], filterable: true }, { key: "work", label: "Work", type: "select", options: ["Printed", "Embroidered", "Solid", "Block print"], filterable: true }] },
      ] },
    ],
  },
  {
    name: "Footwear",
    slug: "footwear",
    description: "Shoes, sneakers and sandals.",
    attributes: [
      { key: "size", label: "Size (UK)", type: "select", options: ["3", "4", "5", "6", "7", "8", "9", "10", "11", "12"], variantAxis: true, filterable: true, required: true },
      { key: "color", label: "Colour", type: "select", options: COLORS, variantAxis: true, filterable: true, required: true },
      { key: "upper_material", label: "Upper material", type: "select", options: ["Leather", "Synthetic", "Mesh", "Canvas", "Suede"], filterable: true },
      { key: "closure", label: "Closure", type: "select", options: ["Lace-up", "Slip-on", "Velcro", "Buckle"], filterable: true },
      { key: "sole", label: "Sole", type: "text" },
    ],
    children: [
      { name: "Sneakers", slug: "sneakers", description: "", attributes: [] },
      { name: "Formal Shoes", slug: "formal-shoes", description: "", attributes: [] },
      { name: "Sandals", slug: "sandals", description: "", attributes: [] },
    ],
  },
  {
    name: "Accessories",
    slug: "accessories",
    description: "Bags, watches, belts and jewellery.",
    attributes: [
      { key: "color", label: "Colour", type: "select", options: [...COLORS, "Gold", "Silver", "Rose gold"], variantAxis: true, filterable: true, required: true },
      { key: "material", label: "Material", type: "select", options: ["Leather", "Faux leather", "Metal", "Stainless steel", "Fabric", "Plastic"], filterable: true },
      { key: "gender", label: "Gender", type: "select", options: ["Men", "Women", "Unisex"], filterable: true },
    ],
    children: [
      { name: "Bags", slug: "bags", description: "", attributes: [{ key: "capacity_l", label: "Capacity", type: "number", unit: "L" }, { key: "compartments", label: "Compartments", type: "number" }, { key: "water_resistant", label: "Water resistant", type: "boolean", filterable: true }] },
      { name: "Watches", slug: "watches", description: "", attributes: [{ key: "movement", label: "Movement", type: "select", options: ["Quartz", "Automatic", "Smart"], filterable: true, required: true }, { key: "dial_mm", label: "Dial size", type: "number", unit: "mm" }, { key: "water_resistance_m", label: "Water resistance", type: "number", unit: "m" }] },
      { name: "Belts", slug: "belts", description: "", attributes: [{ key: "belt_size", label: "Waist size", type: "select", options: ["28", "30", "32", "34", "36", "38", "40"], variantAxis: true, filterable: true, required: true }] },
      { name: "Jewellery", slug: "jewellery", description: "", attributes: [{ key: "plating", label: "Plating", type: "select", options: ["Gold", "Silver", "Rhodium", "None"], filterable: true }, { key: "stone", label: "Stone", type: "text" }] },
    ],
  },
  {
    name: "Electronics",
    slug: "electronics",
    description: "Phones, audio and wearables.",
    attributes: [
      { key: "color", label: "Colour", type: "select", options: ["Black", "White", "Blue", "Silver", "Graphite", "Green"], variantAxis: true, filterable: true, required: true },
      { key: "warranty_months", label: "Warranty", type: "number", unit: "months", required: true },
      { key: "connectivity", label: "Connectivity", type: "multiselect", options: ["Bluetooth", "Wi-Fi", "USB-C", "NFC", "5G"], filterable: true },
    ],
    children: [
      { name: "Mobiles", slug: "mobiles", description: "", attributes: [{ key: "storage", label: "Storage", type: "select", options: ["64 GB", "128 GB", "256 GB", "512 GB"], variantAxis: true, filterable: true, required: true }, { key: "ram", label: "RAM", type: "select", options: ["4 GB", "6 GB", "8 GB", "12 GB"], filterable: true }, { key: "battery_mah", label: "Battery", type: "number", unit: "mAh" }, { key: "screen_in", label: "Screen size", type: "number", unit: "in" }] },
      { name: "Headphones", slug: "headphones", description: "", attributes: [{ key: "form", label: "Type", type: "select", options: ["In-ear", "On-ear", "Over-ear"], filterable: true }, { key: "anc", label: "Noise cancelling", type: "boolean", filterable: true }, { key: "battery_hours", label: "Battery life", type: "number", unit: "hours" }] },
    ],
  },
];

interface Sample {
  category: string;
  title: string;
  brand: string;
  attributes: Record<string, unknown>;
  axes: Record<string, string[]>;
  price: number;
  compareAtPrice?: number;
}

const SAMPLES: Sample[] = [
  { category: "men-t-shirts", title: "Essential Crew T-Shirt", brand: "Northline", attributes: { material: "Cotton", fit: "Regular", neck: "Crew", care: "Machine wash cold" }, axes: { size: ["S", "M", "L", "XL"], color: ["Black", "White", "Navy"] }, price: 59900, compareAtPrice: 79900 },
  { category: "women-dresses", title: "Linen Midi Dress", brand: "Saanjh", attributes: { material: "Linen", fit: "Relaxed", length: "Midi", occasion: ["Casual", "Work"] }, axes: { size: ["XS", "S", "M", "L"], color: ["Beige", "Green"] }, price: 249900 },
  { category: "sneakers", title: "Everyday Runner Sneakers", brand: "Stride", attributes: { upper_material: "Mesh", closure: "Lace-up", sole: "EVA foam" }, axes: { size: ["6", "7", "8", "9", "10"], color: ["White", "Black"] }, price: 349900, compareAtPrice: 449900 },
  { category: "watches", title: "Field Automatic Watch", brand: "Tempo", attributes: { material: "Stainless steel", gender: "Unisex", movement: "Automatic", dial_mm: 40, water_resistance_m: 100 }, axes: { color: ["Silver", "Black"] }, price: 1299900 },
  { category: "bags", title: "Commuter Backpack 22L", brand: "Northline", attributes: { material: "Fabric", gender: "Unisex", capacity_l: 22, compartments: 3, water_resistant: true }, axes: { color: ["Black", "Grey", "Navy"] }, price: 189900 },
  { category: "mobiles", title: "Nova 5G Smartphone", brand: "Nova", attributes: { warranty_months: 12, connectivity: ["Bluetooth", "Wi-Fi", "USB-C", "5G"], ram: "8 GB", battery_mah: 5000, screen_in: 6.6 }, axes: { storage: ["128 GB", "256 GB"], color: ["Black", "Blue"] }, price: 1899900 },
];

function combinations(axes: Record<string, string[]>): Record<string, string>[] {
  return Object.entries(axes).reduce<Record<string, string>[]>((acc, [key, values]) => acc.flatMap((combo) => values.map((value) => ({ ...combo, [key]: value }))), [{}]);
}

async function main(): Promise<void> {
  const config = loadConfig();
  const logger = createLogger("info", { script: "seed-catalog" });
  const audit = { record: () => undefined };
  const categories = new CategoryService(audit);
  const products = new ProductService({ categories, uploads: new UploadService(undefined, logger), audit });

  await connectMongo(config, logger);
  try {
    await Promise.all([Category.createIndexes(), Product.createIndexes()]);
    let created = 0;
    const visit = async (nodes: SeedCategory[], parentId: string | null, depth: number): Promise<void> => {
      for (const [index, node] of nodes.entries()) {
        const existing = await Category.findOne({ slug: node.slug }).lean();
        let id = existing?._id.toString();
        if (!id) {
          const input = createCategorySchema.parse({ name: node.name, slug: node.slug, description: node.description, parentId, sortOrder: index, attributes: node.attributes });
          id = (await categories.create(input, "seed")).id;
          created += 1;
          logger.info("Category created", { slug: node.slug, depth });
        }
        if (node.children) await visit(node.children, id, depth + 1);
      }
    };
    await visit(TREE, null, 0);
    logger.info("Categories seeded", { created });

    if (process.env.SEED_SAMPLE_PRODUCTS === "true") {
      for (const sample of SAMPLES) {
        const category = await Category.findOne({ slug: sample.category }).lean();
        if (!category || (await Product.exists({ title: sample.title }))) continue;
        const prefix = sample.title.replace(/[^A-Za-z]/g, "").slice(0, 6).toUpperCase();
        const variants = combinations(sample.axes).map((options, index) => ({
          sku: `${prefix}-${String(index + 1).padStart(3, "0")}`,
          options,
          price: sample.price + (options.storage === "256 GB" ? 300000 : 0),
          compareAtPrice: sample.compareAtPrice ?? null,
          stock: 5 + ((index * 7) % 20),
        }));
        const input = createProductSchema.parse({ title: sample.title, brand: sample.brand, categoryId: category._id.toString(), attributes: sample.attributes, variants, status: "active", isFeatured: true, description: `${sample.title} by ${sample.brand}.`, tags: [sample.brand.toLowerCase()] });
        await products.create(input, "seed");
        logger.info("Sample product created", { title: sample.title, variants: variants.length });
      }
    }
  } finally {
    await disconnectMongo();
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`Catalog seed failed: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
