import { Schema, model, type InferSchemaType } from "mongoose";

const categorySchema = new Schema(
    {
        name: {
            type: String,
            required: true,
            trim: true,
            maxlength: 100,
        },
        slug: {
            type: String,
            required: true,
            trim: true,
            lowercase: true,
            maxlength: 120,
        },
        description: {
            type: String,
            trim: true,
            maxlength: 500,
        },
        image: {
            type: String,
            trim: true,
        },
        isActive: {
            type: Boolean,
            default: true,
        },
        sortOrder: {
            type: Number,
            default: 0,
            min: 0,
            validate: {
                validator: Number.isSafeInteger,
                message: "Sort order must be a safe integer.",
            },
        },
    },
    {
        timestamps: true,
        versionKey: false,
    },
);

categorySchema.index({ slug: 1 }, { unique: true });
categorySchema.index({ isActive: 1, sortOrder: 1, name: 1 });

export type Category = InferSchemaType<typeof categorySchema>;

export const CategoryModel = model("Category", categorySchema);
