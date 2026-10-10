import { connectMongoose, disconnectDb } from "../../config/mongoose.js";
import { logger } from "../../utils/logger.js";
import { CategoryModel } from "../Category/category.model.js";
import { Product, PRODUCT_STATUSES } from "./product.model.js";

const DEMO_PRODUCT = {
    name: "Studio Wireless Headphones",
    slug: "development-demo-headphones",
    description:
        "Development demo product for testing the ShopSphere catalog and product details page. Features a comfortable over-ear design and wireless listening.",
    shortDescription: "Comfortable wireless headphones for everyday listening.",
    brand: "ShopSphere Studio",
    images: [
        {
            url: "https://images.unsplash.com/photo-1505740420928-5e560c06d30e",
            alt: "Wireless headphones",
            isPrimary: true,
            sortOrder: 0,
        },
    ],
    attributes: {
        connectivity: "Wireless",
        type: "Over-ear",
    },
    status: PRODUCT_STATUSES.ACTIVE,
};

async function seedDemoProduct(): Promise<void> {
    // Guard against accidentally seeding demo data into a non-development database.
    if (process.env.NODE_ENV !== "development" || process.env.ALLOW_DEV_PRODUCT_SEED !== "true") {
        throw new Error(
            "Product seeding is allowed only when NODE_ENV=development and ALLOW_DEV_PRODUCT_SEED=true.",
        );
    }

    await connectMongoose();

    try {
        const category = await CategoryModel.findOne({ slug: "electronics", isActive: true })
            .select("_id")
            .lean();

        if (!category) {
            throw new Error('Active "electronics" category not found. Run the category seed first.');
        }

        const existing = await Product.findOne({ slug: DEMO_PRODUCT.slug }).select("status");

        if (existing) {
            if (existing.status !== PRODUCT_STATUSES.ACTIVE) {
                throw new Error(
                    `Product "${DEMO_PRODUCT.slug}" already exists but is not active. No changes made.`,
                );
            }

            logger.info(`Demo product already exists: ${DEMO_PRODUCT.slug}`);
            return;
        }

        await Product.create({ ...DEMO_PRODUCT, categoryId: category._id });

        logger.info(`Demo product created: ${DEMO_PRODUCT.slug}`);
    } finally {
        // Close the connection so the script exits instead of hanging.
        await disconnectDb();
    }
}

seedDemoProduct().catch((error: unknown) => {
    logger.error("Demo product seeding failed: " + (error instanceof Error ? error.message : error));
    process.exitCode = 1;
});
