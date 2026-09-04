export type ErrorCode =
  | "VALIDATION_ERROR"
  | "NOT_FOUND"
  | "UNSUPPORTED_URL"
  | "PROVIDER_ERROR"
  | "UPSTREAM_ERROR"
  | "BINARY_MISSING"
  | "RATE_LIMITED"
  | "AGE_RESTRICTED"
  | "PRIVATE_CONTENT"
  | "GEO_BLOCKED"
  | "LOGIN_REQUIRED"
  | "COOKIES_REQUIRED"
  | "BOT_CHECK"
  | "DOWNLOAD_FAILED"
  | "INTERNAL_ERROR";

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details?: unknown;

  constructor(code: ErrorCode, message: string, status = 500, details?: unknown) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export const ValidationError = (message: string, details?: unknown) =>
  new AppError("VALIDATION_ERROR", message, 400, details);

export const NotFoundError = (message = "Not found") =>
  new AppError("NOT_FOUND", message, 404);

export const UnsupportedUrlError = (url: string) =>
  new AppError("UNSUPPORTED_URL", `No provider matches the URL: ${url}`, 400);

export const BinaryMissingError = (binary: string, hint: string) =>
  new AppError("BINARY_MISSING", `Required binary '${binary}' was not found. ${hint}`, 503);

export const ProviderError = (message: string, code: ErrorCode = "PROVIDER_ERROR") =>
  new AppError(code, message, 422);

export const CookiesRequiredError = (provider: string, reason = "Authentication cookies are required for this content.") =>
  new AppError(
    "COOKIES_REQUIRED",
    reason,
    422,
    { provider, retryable: true, cookiesDetected: false },
  );

/**
 * BOT_CHECK — upstream platform (typically YouTube) is gating the request
 * behind a "Sign in to confirm you're not a bot" challenge. This is an
 * external platform limitation, not an application bug. Returned as HTTP 422
 * with structured details so clients can render a friendly message.
 */
export const BotCheckError = (
  provider: string,
  opts: { videoId?: string; retryable?: boolean } = {},
) =>
  new AppError(
    "BOT_CHECK",
    "YouTube blocked this request. Retrying with fallback...",
    422,
    { error: "bot_block", provider, retryable: opts.retryable ?? true, videoId: opts.videoId },
  );