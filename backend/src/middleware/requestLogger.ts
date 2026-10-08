import type {RequestHandler} from "express";
import { logger } from "../utils/logger.js";

export const requestLogger: RequestHandler = (req, res, next) => {
    const start = Date.now();
    res.on("finish", () => {
        const durationMs = Date.now() - start;
        logger.info("Request completed", {
            method: req.method,
            url: req.originalUrl,
            statusCode: res.statusCode,
            durationMs,
            requestId: res.locals.requestId,
        });
    });
    next();
};