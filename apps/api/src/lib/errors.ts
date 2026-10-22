import type { ErrorRequestHandler, RequestHandler } from "express";
import multer from "multer";
import { ZodError } from "zod";
import { logger } from "../logger";

/** §11 error shape: { error: { code, message, details } }. */
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export const badRequest = (message: string, details?: unknown, code = "bad_request") =>
  new ApiError(400, code, message, details);
export const unauthorized = (message = "Sign in to continue.") => new ApiError(401, "unauthorized", message);
export const forbidden = (message = "You don't have access to this.", code = "forbidden") =>
  new ApiError(403, code, message);
export const notFound = (message = "Not found.") => new ApiError(404, "not_found", message);
export const conflict = (message: string, code = "conflict", details?: unknown) => new ApiError(409, code, message, details);
export const unavailable = (message: string, code = "unavailable") => new ApiError(503, code, message);

export function zodDetails(err: ZodError) {
  return {
    issues: err.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
  };
}

export const notFoundHandler: RequestHandler = (_req, res) => {
  res.status(404).json({ error: { code: "not_found", message: "No such route." } });
};

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  if (res.headersSent) {
    req.log?.error({ err }, "error after headers sent");
    return;
  }
  if (err instanceof ApiError) {
    res.status(err.status).json({ error: { code: err.code, message: err.message, details: err.details } });
    return;
  }
  if (err instanceof ZodError) {
    res.status(400).json({ error: { code: "validation_error", message: "Check the highlighted fields.", details: zodDetails(err) } });
    return;
  }
  if (err instanceof multer.MulterError) {
    const tooLarge = err.code === "LIMIT_FILE_SIZE";
    res.status(tooLarge ? 413 : 400).json({
      error: {
        code: tooLarge ? "file_too_large" : "upload_error",
        message: tooLarge ? "This file is larger than the size limit." : err.message,
        details: { field: err.field },
      },
    });
    return;
  }
  if (err?.type === "entity.too.large") {
    res.status(413).json({ error: { code: "body_too_large", message: "The request body is larger than 1 MB." } });
    return;
  }
  if (err?.type === "entity.parse.failed") {
    res.status(400).json({ error: { code: "invalid_json", message: "The request body isn't valid JSON." } });
    return;
  }
  (req.log ?? logger).error({ err }, "unhandled error");
  res.status(500).json({ error: { code: "internal", message: "Something went wrong on our side. Try again." } });
};
