import { Router } from "express";
import { authenticate } from "../middleware/authenticate.js";
import { rateLimit } from "../middleware/rateLimit.js";
import { validate } from "../middleware/validate.js";
import { createUploadSignature } from "../module/Upload/upload.service.js";
import { uploadSignatureSchema, type UploadSignatureInput } from "../module/Upload/upload.validation.js";
import { getActor } from "../utils/actor.js";
import { handle } from "../utils/http.js";

const uploadRouter = Router();

uploadRouter.post(
    "/signature",
    authenticate,
    rateLimit({ name: "upload-signature", windowSeconds: 60, max: 30, key: (req) => req.ip ?? "unknown" }),
    validate({ body: uploadSignatureSchema }),
    handle(async (req, res) => ({
        message: "Upload signature created.",
        data: await createUploadSignature(getActor(res), req.body as UploadSignatureInput),
    })),
);

export default uploadRouter;
