import { z } from "zod";
import dotenv from "dotenv";
// Do NOT override process.env values already injected by the platform
// (e.g. Railway). Without { override: false }, a stale .env baked into
// the image would clobber real runtime variables like
// YOUTUBE_GETPOT_BASE_URL=http://zesty-grace.railway.internal:4416.
dotenv.config({ override: false });
import os from "node:os";
import path from "node:path";

// force redeploy

const schema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().int().positive().default(8787),
  HOST: z.string().default("0.0.0.0"),
  LOG_LEVEL: z.enum(["trace", "debug", "info", "warn", "error", "fatal"]).default("info"),

  CORS_ORIGINS: z.string().default("*"),
  FRONTEND_ORIGIN: z.string().optional(),

  YTDLP_PATH: z.string().optional(),
  FFMPEG_PATH: z.string().optional(),
  FFPROBE_PATH: z.string().optional(),

  COOKIES_FILE: z.string().optional(),
  // Railway/Render-friendly alternatives to uploading a physical cookies.txt.
  // Prefer COOKIES_TXT_BASE64 for multiline Netscape cookies exports.
  COOKIES_TXT: z.string().optional(),
  COOKIES_TXT_BASE64: z.string().optional(),

  // Groq — free LLM + Whisper (one key) https://console.groq.com
  GROQ_API_KEY: z.string().optional(),
  // SEO chat model. Defaults to Groq's recommended llama-3.3-70b replacement
  // (shut down 2026-08-16). Override if Groq rotates models again.
  GROQ_SEO_MODEL: z.string().optional(),

  // Per-provider cookie overrides. When set, they take precedence over
  // the generic COOKIES_TXT* pair for that provider only.
  INSTAGRAM_COOKIES_TXT: z.string().optional(),
  INSTAGRAM_COOKIES_TXT_BASE64: z.string().optional(),
  FACEBOOK_COOKIES_TXT: z.string().optional(),
  FACEBOOK_COOKIES_TXT_BASE64: z.string().optional(),

  MAX_CONCURRENT_DOWNLOADS: z.coerce.number().int().positive().default(5),

  // Default to the OS temp dir (e.g. /tmp on Linux/Railway) — the project
  // directory is read-only in many serverless / container deployments, so
  // writing yt-dlp output there fails with EACCES/EROFS. Override with
  // TMP_DIR to pin a custom writeable path.
  TMP_DIR: z.string().default(path.join(os.tmpdir(), "mediahub")),
  MAX_FILE_SIZE_MB: z.coerce.number().int().positive().default(2048),
  JOB_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(10 * 60_000),

  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(60),

  METADATA_CACHE_TTL_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(10 * 60_000),
  METADATA_CACHE_MAX: z.coerce.number().int().positive().default(500),

  // Cookie freshness canary — periodic yt-dlp probe to detect stale sessions.
  COOKIE_CANARY_URL: z.string().optional(),
  COOKIE_CANARY_INTERVAL_MS: z.coerce.number().int().positive().optional(),

  // YouTube hardening — server-only, NEVER exposed to the frontend.
  // Override the desktop User-Agent yt-dlp sends to YouTube.
  YOUTUBE_USER_AGENT: z.string().optional(),
  // Innertube `visitorData` + a matching PO token pair. When BOTH are
  // set the YouTube provider appends them to --extractor-args so the
  // adaptive HD streams stop falling back to the bot-check wall.
  YOUTUBE_VISITOR_DATA: z.string().optional(),
  YOUTUBE_PO_TOKEN: z.string().optional(),

  // Optional outbound proxy for yt-dlp (e.g. http://user:pass@host:port,
  // socks5://host:port). When set, --proxy is appended to BOTH metadata
  // fetches and download/stream invocations.
  PROXY_URL: z.string().optional(),
  // Backward-compatible legacy name; PROXY_URL takes precedence when both exist.
  DOWNLOAD_PROXY_URL: z.string().optional(),

  // PO-token helper endpoint used by yt-dlp-get-pot. Defaults to the local
  // bgutil sidecar port requested for Railway/Docker deployments.
  // NOTE: no Zod .default() here. We observed cases on Railway where
  // .default() was winning over a present process.env value (parsed
  // returned "http://localhost:4416" length=21 while process.env had
  // the real internal URL length=47). Make it optional and apply the
  // fallback explicitly below so the env value always wins.
  YOUTUBE_GETPOT_BASE_URL: z.string().optional(),

  // Shared secret guarding /api/v1/debug/diagnostics. When unset, the
  // diagnostics endpoint returns 404 (disabled).
  DEBUG_DIAGNOSTICS_TOKEN: z.string().optional(),
});

export type Env = Omit<z.infer<typeof schema>, "YOUTUBE_GETPOT_BASE_URL"> & {
  YOUTUBE_GETPOT_BASE_URL: string;
};

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  // eslint-disable-next-line no-console
  console.error("Invalid environment variables:\n", parsed.error.format());
  process.exit(1);
}

const _data = parsed.data;
// Explicit fallback: env value > default. Trim to defend against
// trailing whitespace / newlines pasted via the Railway UI.
const _potBase =
  (process.env.YOUTUBE_GETPOT_BASE_URL ?? _data.YOUTUBE_GETPOT_BASE_URL ?? "").trim() ||
  "http://localhost:4416";
export const env: Env = { ..._data, YOUTUBE_GETPOT_BASE_URL: _potBase };
// NOTE: no logger here — this module loads before pino is constructed
// (logger imports env for LOG_LEVEL). Boot logging lives in server.ts.
export const isProd = env.NODE_ENV === "production";
export const isDev = env.NODE_ENV === "development";

export function getYtDlpProxyUrl(): string | undefined {
  return env.PROXY_URL || env.DOWNLOAD_PROXY_URL;
}
