import { ValidationError } from "@/errors/AppError.js";

/**
 * Lightweight URL validator. SSRF guard is handled by ProviderRegistry,
 * which only accepts whitelisted hostnames (one per Provider). We still
 * reject non-http(s) and obviously malformed inputs early.
 */
export function parseAndValidateUrl(input: string): URL {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw ValidationError("Invalid URL");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw ValidationError("Only http(s) URLs are supported");
  }
  return url;
}