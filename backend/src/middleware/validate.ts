import type { RequestHandler } from "express";
import type { ZodType } from "zod";

import { AppError } from "../errors/AppError.js";

interface validationSchema{ body?: ZodType; params?: ZodType; query?: ZodType }

export function validate(schemas: validationSchema): RequestHandler {
    return (req, _res, next) => {
        if (schemas.body) {
            const result = schemas.body.safeParse(req.body);
            if (!result.success) {
                return next(new AppError(result.error.message, 400, "VALIDATION_ERROR"));
               
            }

            req.body = result?.data;
        }
        if (schemas.params) {
            const result = schemas.params.safeParse(req.params);
            if (!result.success) {
                return next(new AppError(result.error.message, 400, "VALIDATION_ERROR"));
            }
            req.params = result.data as typeof req.params;

        }
        if(schemas.query){
            const result = schemas.query.safeParse(req.query);
            if (!result.success) {
                return next(new AppError(result.error.message, 400, "VALIDATION_ERROR"));
            }
            req.query = result.data as typeof req.query;
        }
        next();
    };
}