import { z } from "zod";

export const uploadSignatureSchema = z.object({
    purpose: z.enum(["vendor_document", "store_branding", "product_image"]),
});

export type UploadSignatureInput = z.infer<typeof uploadSignatureSchema>;
