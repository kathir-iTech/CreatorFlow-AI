import path from "node:path";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { env } from "@/config/env.js";
import { logger } from "@/logging/logger.js";

const DEFAULT_LOOKUPS = ["./cookies.txt", "./tmp/cookies.txt", "./bin/cookies.txt"];

let detected: string | null | undefined;
// Per-provider cookies file cache. Keys: "instagram", "facebook", ...
const providerDetected = new Map<string, string | null>();
let diagnostics: CookiesDiagnostics = {
  envBase64Present: false,
  envBase64Length: 0,
  envPlainPresent: false,
  envPlainLength: 0,
  materializeError: null,
  materializedPath: null,
  candidatesChecked: [],
};

export interface CookiesDiagnostics {
  envBase64Present: boolean;
  envBase64Length: number;
  envPlainPresent: boolean;
  envPlainLength: number;
  materializeError: string | null;
  materializedPath: string | null;
  candidatesChecked: string[];
}

export function getCookiesDiagnostics(): CookiesDiagnostics {
  return diagnostics;
}

interface ProviderCookieEnv {
  base64?: string;
  plain?: string;
  filename: string;
  label: string;
}

function providerCookieEnv(providerId: string): ProviderCookieEnv | null {
  switch (providerId) {
    case "instagram":
      return {
        base64: env.INSTAGRAM_COOKIES_TXT_BASE64,
        plain: env.INSTAGRAM_COOKIES_TXT,
        filename: "instagram-cookies.txt",
        label: "INSTAGRAM_COOKIES",
      };
    case "facebook":
      return {
        base64: env.FACEBOOK_COOKIES_TXT_BASE64,
        plain: env.FACEBOOK_COOKIES_TXT,
        filename: "facebook-cookies.txt",
        label: "FACEBOOK_COOKIES",
      };
    default:
      return null;
  }
}

function materializeProviderCookies(providerId: string): string | null {
  const cfg = providerCookieEnv(providerId);
  if (!cfg) return null;
  try {
    let raw: string | undefined;
    if (cfg.base64) {
      const cleaned = cfg.base64.replace(/\s+/g, "");
      raw = Buffer.from(cleaned, "base64").toString("utf8");
    } else if (cfg.plain) {
      raw = cfg.plain.replace(/\\n/g, "\n");
    }
    if (!raw?.trim()) return null;
    const target = path.resolve(env.TMP_DIR, cfg.filename);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, raw, { encoding: "utf8", mode: 0o600 });
    logger.info(
      { cookies: target, bytes: raw.length, source: cfg.base64 ? `${cfg.label}_BASE64` : cfg.label, provider: providerId },
      "provider cookies.txt materialized from environment",
    );
    return target;
  } catch (err) {
    logger.error({ err, provider: providerId }, "Failed to materialize provider cookies.txt");
    return null;
  }
}

/**
 * Resolve the cookies.txt path for a specific provider. Falls back to the
 * generic COOKIES_TXT* pair when no provider-specific override exists.
 */
export function getCookiesPathFor(providerId?: string): string | null {
  if (!providerId) return getCookiesPath();
  if (providerDetected.has(providerId)) return providerDetected.get(providerId)!;
  const cfg = providerCookieEnv(providerId);
  if (cfg && (cfg.base64 || cfg.plain)) {
    const materialized = materializeProviderCookies(providerId);
    if (materialized) {
      providerDetected.set(providerId, materialized);
      return materialized;
    }
  }
  const generic = getCookiesPath();
  providerDetected.set(providerId, generic);
  return generic;
}

function materializeEnvCookies(): string | null {
  diagnostics.envBase64Present = !!env.COOKIES_TXT_BASE64;
  diagnostics.envBase64Length = env.COOKIES_TXT_BASE64?.length ?? 0;
  diagnostics.envPlainPresent = !!env.COOKIES_TXT;
  diagnostics.envPlainLength = env.COOKIES_TXT?.length ?? 0;

  try {
    let raw: string | undefined;
    if (env.COOKIES_TXT_BASE64) {
      // Strip whitespace/newlines that Railway's UI may inject when pasting long base64.
      const cleaned = env.COOKIES_TXT_BASE64.replace(/\s+/g, "");
      raw = Buffer.from(cleaned, "base64").toString("utf8");
    } else if (env.COOKIES_TXT) {
      raw = env.COOKIES_TXT.replace(/\\n/g, "\n");
    }

    if (!raw?.trim()) {
      if (env.COOKIES_TXT_BASE64 || env.COOKIES_TXT) {
        diagnostics.materializeError =
          "Cookie env var is set but decoded contents are empty. Re-export cookies.txt and re-encode.";
        logger.warn({ source: env.COOKIES_TXT_BASE64 ? "COOKIES_TXT_BASE64" : "COOKIES_TXT" }, diagnostics.materializeError);
      }
      return null;
    }

    // Sanity check: Netscape cookies.txt files start with "# Netscape" or contain TAB-separated rows.
    if (!/^#\s*Netscape/i.test(raw) && !raw.includes("\t")) {
      diagnostics.materializeError =
        "Decoded cookies content does not look like a Netscape cookies.txt export (no header or TAB-separated rows).";
      logger.warn(diagnostics.materializeError);
    }

    const target = path.resolve(env.TMP_DIR, "cookies.txt");
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, raw, { encoding: "utf8", mode: 0o600 });
    diagnostics.materializedPath = target;
    logger.info(
      { cookies: target, bytes: raw.length, source: env.COOKIES_TXT_BASE64 ? "COOKIES_TXT_BASE64" : "COOKIES_TXT" },
      "cookies.txt materialized from environment",
    );
    return target;
  } catch (err) {
    diagnostics.materializeError = (err as Error).message;
    logger.error({ err }, "Failed to materialize cookies.txt from environment");
    return null;
  }
}

export function detectCookiesPath(): string | null {
  if (detected !== undefined) return detected;
  const candidates = env.COOKIES_FILE
    ? [env.COOKIES_FILE, ...DEFAULT_LOOKUPS]
    : DEFAULT_LOOKUPS;
  diagnostics.candidatesChecked = candidates.map((c) => path.resolve(c));
  for (const c of candidates) {
    const abs = path.resolve(c);
    if (existsSync(abs)) {
      detected = abs;
      logger.info({ cookies: abs }, "cookies.txt detected");
      return detected;
    }
  }
  const envCookies = materializeEnvCookies();
  if (envCookies) {
    detected = envCookies;
    return detected;
  }
  detected = null;
  logger.info(
    {
      envBase64Present: diagnostics.envBase64Present,
      envBase64Length: diagnostics.envBase64Length,
      envPlainPresent: diagnostics.envPlainPresent,
      materializeError: diagnostics.materializeError,
      candidatesChecked: diagnostics.candidatesChecked,
    },
    "No cookies.txt detected — continuing without cookies",
  );
  return null;
}

export function getCookiesPath(): string | null {
  if (detected === undefined) return detectCookiesPath();
  return detected;
}

/** Force re-detection on next call. Used by POST /system/cookies/recheck after env updates. */
export function resetCookiesDetection(): void {
  detected = undefined;
  providerDetected.clear();
  diagnostics = {
    envBase64Present: false,
    envBase64Length: 0,
    envPlainPresent: false,
    envPlainLength: 0,
    materializeError: null,
    materializedPath: null,
    candidatesChecked: [],
  };
}