import type { RequestHandler } from "express";

import { AppError } from "../errors/AppError.js";

export const notFoundHandler: RequestHandler = (req, _res, next) => {
    next(new AppError(`Route ${req.method} ${req.originalUrl} not found`, 404, "ROUTE_NOT_FOUND"));
}