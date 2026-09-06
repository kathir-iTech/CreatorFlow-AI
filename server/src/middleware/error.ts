import type { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";
import { AppError } from "@/errors/AppError.js";
import { logger } from "@/logging/logger.js";

export function notFoundHandler(req: Request, res: Response): void {
  const rid = String((req as Request & { id?: unknown }).id ?? "unknown");
  try {
    if (res.headersSent) {
      res.destroy();
      return;
    }
    res.status(404).json({
      data: null,
      error: { code: "NOT_FOUND", message: `Route ${req.method} ${req.path} not found` },
      requestId: rid,
    });
  } catch (e) {
    logger.warn({ err: e, requestId: rid }, "notFoundHandler response failed, destroying");
    try {
      res.destroy();
    } catch {}
  }
}

function safeJson(res: Response, status: number, body: unknown, requestId: string): void {
  if (res.headersSent) {
    logger.warn({ requestId, status }, "safeJson: headers already sent, destroying instead of sending");
    try {
      res.destroy();
    } catch {}
    return;
  }
  try {
    res.status(status).json(body);
  } catch (e) {
    // This is the exact bug Part 2 hunts: res.status().json() itself throwing
    // (headers race, circular payload, app destroyed mid-write) would otherwise
    // bubble to Express default handler → 502 with no body via pino-http onResFinished.
    logger.error({ requestId, err: e, status }, "safeJson: res.json threw, destroying response");
    try {
      if (!res.headersSent) {
        // Last resort: try plain text if JSON serialization was the issue
        res.status(500).json({ data: null, error: { code: "INTERNAL_ERROR", message: "Response serialization failed" }, requestId });
      } else {
        res.destroy();
      }
    } catch {
      try {
        res.destroy();
      } catch {}
    }
  }
}

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  const requestId = String((req as Request & { id?: unknown }).id ?? "unknown");

  // Headers already streaming (e.g. /stream mid-pipe): JSON is impossible —
  // destroy instead of throwing ERR_HTTP_HEADERS_SENT, which would surface
  // to the client as a raw proxy-style 502 with no body.
  if (res.headersSent) {
    logger.warn({ requestId, err }, "Error after headers sent, destroying response");
    try {
      res.destroy();
    } catch {}
    return;
  }

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
    safeJson(res, err.status, { data: null, error: errorBody, requestId }, requestId);
    return;
  }

  if (err instanceof ZodError) {
    safeJson(
      res,
      400,
      {
        data: null,
        error: { code: "VALIDATION_ERROR", message: "Invalid input", details: err.flatten() },
        requestId,
      },
      requestId,
    );
    return;
  }

  const message = err instanceof Error ? err.message : "Unknown error";
  logger.error({ requestId, err }, "Unhandled error");
  safeJson(res, 500, { data: null, error: { code: "INTERNAL_ERROR", message }, requestId }, requestId);
}