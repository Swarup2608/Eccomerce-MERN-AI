import type { NextFunction, Request, RequestHandler, Response } from "express";

// Wraps an async handler that returns { status?, message, data? } so controllers
// stay declarative and every error reaches the error handler.
export interface HandlerResult {
    status?: number;
    message: string;
    data?: unknown;
}

export function handle(fn: (req: Request, res: Response) => Promise<HandlerResult>): RequestHandler {
    return async (req: Request, res: Response, next: NextFunction) => {
        try {
            const result = await fn(req, res);

            return res.status(result.status ?? 200).json({
                success: true,
                message: result.message,
                ...(result.data !== undefined ? { data: result.data } : {}),
            });
        } catch (error) {
            return next(error);
        }
    };
}

// Route params are validated by the validate middleware before handlers run.
export function param(req: Request, name: string): string {
    const value = req.params[name];
    return typeof value === "string" ? value : "";
}
