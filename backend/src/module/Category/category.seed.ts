import { connectMongoose, disconnectDb } from "../../config/mongoose.js";
import { logger } from "../../utils/logger.js";
import { CategoryModel } from "./category.model.js";

const categories = [
    { name: "Electronics", slug: "electronics", description: "Phones, computers, and electronic accessories.", sortOrder: 1 },
    { name: "Fashion", slug: "fashion", description: "Clothing and fashion essentials.", sortOrder: 2 },
    { name: "Home & Living", slug: "home-living", description: "Furniture, decor, and household essentials.", sortOrder: 3 },
    { name: "Beauty", slug: "beauty", description: "Beauty, skincare, and personal care products.", sortOrder: 4 },
    { name: "Footwear", slug: "footwear", description: "Shoes, sandals, and everyday footwear.", sortOrder: 5 },
    { name: "Accessories", slug: "accessories", description: "Bags, watches, and lifestyle accessories.", sortOrder: 6 },
];

async function seedCategories(): Promise<void> {
    await connectMongoose();

    try {
        for (const category of categories) {
            // $setOnInsert only creates missing categories; re-running never overwrites edits.
            await CategoryModel.updateOne(
                { slug: category.slug },
                { $setOnInsert: { ...category, isActive: true } },
                { upsert: true },
            );
        }

        logger.info("Category seeding completed.");
    } finally {
        // Close the connection so the script exits instead of hanging.
        await disconnectDb();
    }
}

seedCategories().catch((error: unknown) => {
    logger.error("Category seeding failed: " + error);
    process.exitCode = 1;
});
