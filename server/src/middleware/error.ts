import type { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";
import { AppError } from "@/errors/AppError.js";
import { logger } from "@/logging/logger.js";

export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    data: null,
    error: { code: "NOT_FOUND", message: `Route ${req.method} ${req.path} not found` },
    requestId: req.id,
  });
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  const requestId = req.id;

  if (err instanceof AppError) {
    logger.warn({ requestId, code: err.code, msg: err.message }, "AppError");
    const errorBody: Record<string, unknown> = {
      code: err.code,
      message: err.message,
      details: err.details,
    };
    // BOT_CHECK contract — surface `provider` and `retryable` at the top
    // level of the error object so the frontend can branch on them without
    // digging into `details`.
    if ((err.code === "BOT_CHECK" || err.code === "COOKIES_REQUIRED") && err.details && typeof err.details === "object") {
      const d = err.details as { error?: string; provider?: string; retryable?: boolean };
      if (d.error) errorBody.error = d.error;
      if (d.provider) errorBody.provider = d.provider;
      if (typeof d.retryable === "boolean") errorBody.retryable = d.retryable;
    }
    res.status(err.status).json({ data: null, error: errorBody, requestId });
    return;
  }

  if (err instanceof ZodError) {
    res.status(400).json({
      data: null,
      error: { code: "VALIDATION_ERROR", message: "Invalid input", details: err.flatten() },
      requestId,
    });
    return;
  }

  const message = err instanceof Error ? err.message : "Unknown error";
  logger.error({ requestId, err }, "Unhandled error");
  res.status(500).json({
    data: null,
    error: { code: "INTERNAL_ERROR", message },
    requestId,
  });
}