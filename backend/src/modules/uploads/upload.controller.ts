import type { RequestHandler } from "express";
import { currentUserId } from "../../middleware/authorize.js";
import { createUploadSchema, type UploadService } from "./upload.service.js";

export interface UploadController {
  createImageUpload: RequestHandler;
}

export function createUploadController(service: UploadService): UploadController {
  return {
    // Returns a short-lived presigned URL; the admin browser PUTs the file straight to R2, then references `key` on the product.
    createImageUpload: async (req, res) => {
      res.status(201).json({ upload: await service.createUpload(createUploadSchema.parse(req.body), currentUserId(res.locals)) });
    },
  };
}
