import type { RequestHandler } from "express";
import type { ZodError, ZodType } from "zod";

import { AppError } from "../errors/AppError.js";

interface validationSchema{ body?: ZodType; params?: ZodType; query?: ZodType }

function formatIssues(error: ZodError) {
    return error.issues.map((issue) => ({
        field: issue.path.map(String).join(".") || null,
        message: issue.message,
    }));
}

export function validate(schemas: validationSchema): RequestHandler {
    return (req, _res, next) => {
        if (schemas.body) {
            const result = schemas.body.safeParse(req.body);
            if (!result.success) {
                return next(new AppError("Request body validation failed", 400, "VALIDATION_ERROR", formatIssues(result.error)));
            }

            req.body = result?.data;
        }
        if (schemas.params) {
            const result = schemas.params.safeParse(req.params);
            if (!result.success) {
                return next(new AppError("Request params validation failed", 400, "VALIDATION_ERROR", formatIssues(result.error)));
            }
            req.params = result.data as typeof req.params;

        }
        if(schemas.query){
            const result = schemas.query.safeParse(req.query);
            if (!result.success) {
                return next(new AppError("Request query validation failed", 400, "VALIDATION_ERROR", formatIssues(result.error)));
            }
            // Express 5 defines req.query as a getter-only property, so assignment throws.
            Object.defineProperty(req, "query", { value: result.data, writable: true, configurable: true });
        }
        next();
    };
}
