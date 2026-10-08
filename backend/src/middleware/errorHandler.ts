import type {ErrorRequestHandler} from "express";

import { logger } from "../utils/logger.js";
import { AppError } from "../errors/AppError.js";

export const errorHandler: ErrorRequestHandler = (error, req, res, next) => {
    const requestId = res.locals.requestId;

    if(error instanceof AppError){
        logger.warn("Application error", {
            requestId,
            method: req.method,
            path: req.originalUrl,
            statusCode : error.statusCode,
            code: error.code,
            message: error.message,
        });
        return res.status(error.statusCode).json({
            success: false,
            error: {
                code: error.code,
                message: error.message,
                requestId,
            },
        });
    }

    // Handle unexpected errors
    logger.error("Unexpected error", {
        requestId,
        method: req.method,
        path: req.originalUrl,
        message: error.message,
        stack: error.stack,
    });
    return res.status(500).json({
        success: false,
        error: {
            code: "INTERNAL_SERVER_ERROR",
            message: "An unexpected error occurred",
            requestId,
        },
    });
};