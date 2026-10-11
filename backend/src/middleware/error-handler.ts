import { ZodError } from "zod";
import type { ErrorRequestHandler, RequestHandler } from "express";
import { HttpError } from "../lib/http-error.js";
import type { Logger } from "../lib/logger.js";

const BODY_PARSER_ERRORS: Record<string, HttpError> = {
  "entity.too.large": new HttpError(413, "PAYLOAD_TOO_LARGE", "Request body is too large"),
  "entity.parse.failed": new HttpError(400, "INVALID_JSON", "Request body is not valid JSON"),
  "encoding.unsupported": new HttpError(415, "UNSUPPORTED_ENCODING", "Unsupported content encoding"),
  "charset.unsupported": new HttpError(415, "UNSUPPORTED_CHARSET", "Unsupported charset"),
  "request.aborted": new HttpError(400, "REQUEST_ABORTED", "Request was aborted"),
};

function toHttpError(error: unknown): HttpError {
  if (error instanceof HttpError) return error;
  if (error instanceof ZodError) {
    const issues = error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message }));
    return new HttpError(400, "VALIDATION_ERROR", "Request validation failed", issues);
  }
  if (typeof error === "object" && error !== null && "type" in error && typeof error.type === "string") {
    const mapped = BODY_PARSER_ERRORS[error.type];
    if (mapped) return mapped;
  }
  return new HttpError(500, "INTERNAL_ERROR", "Internal server error");
}

export const notFoundHandler: RequestHandler = (_req, _res, next) => {
  next(new HttpError(404, "NOT_FOUND", "Route not found"));
};

// Clients only ever see the status, a stable code and a safe message; stacks and internals stay in the logs.
export function errorHandler(logger: Logger): ErrorRequestHandler {
  return (error: unknown, req, res, next) => {
    const httpError = toHttpError(error);
    const requestId = res.locals.requestId;

    if (httpError.status >= 500) logger.error("Unhandled error", { requestId, method: req.method, path: req.path, error });
    else logger.debug("Request rejected", { requestId, status: httpError.status, code: httpError.code });

    if (res.headersSent) return next(error);

    const body: Record<string, unknown> = { code: httpError.code, message: httpError.message, requestId };
    if (httpError.details !== undefined) body.details = httpError.details;
    res.status(httpError.status).json({ error: body });
  };
}
